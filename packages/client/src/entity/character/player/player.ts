import Task from './task';
import Skill from './skill';
import Ability from './ability';
import Friend from './friend';
import Armour from './equipment/armour';
import Boots from './equipment/boots';
import Pendant from './equipment/pendant';
import Ring from './equipment/ring';
import Weapon from './equipment/weapon';
import Arrows from './equipment/arrows';

import Character from '../character';

import { Modules } from '@kaetram/common/network';
import _ from 'lodash-es';

import type { AchievementData } from '@kaetram/common/types/achievement';
import type { EquipmentData } from '@kaetram/common/types/equipment';
import type { PlayerData } from '@kaetram/common/types/player';
import type { SkillData } from '@kaetram/common/types/skills';
import type { QuestData } from '@kaetram/common/types/quest';
import type { AbilityData } from '@kaetram/common/types/ability';
import type { Friend as FriendType, FriendInfo } from '@kaetram/common/types/friends';

type AbilityCallback = (key: string, level: number, quickSlot: number) => void;
type PoisonCallback = (status: boolean) => void;
type ManaCallback = (mana: number, maxMana: number) => void;

export default class Player extends Character {
    public rank: Modules.Ranks = Modules.Ranks.None;
    public wanted = false;

    public pvpKills = -1;
    public pvpDeaths = -1;

    public moveLeft = false;
    public moveRight = false;
    public moveUp = false;
    public moveDown = false;

    public poison = false;
    public disableAction = false;

    public medal: Modules.Medals = Modules.Medals.None;

    public override hitPoints = 0;
    public override maxHitPoints = 0;

    public override mana = 0;
    public override maxMana = 0;

    // Mapping of all equipments to their type.
    public equipments = {
        [Modules.Equipment.Armour]: new Armour(),
        [Modules.Equipment.Boots]: new Boots(),
        [Modules.Equipment.Pendant]: new Pendant(),
        [Modules.Equipment.Ring]: new Ring(),
        [Modules.Equipment.Weapon]: new Weapon(),
        [Modules.Equipment.Arrows]: new Arrows()
    };

    public skills: { [key: number]: Skill } = {};
    public abilities: { [key: string]: Ability } = {};
    public quests: { [key: string]: Task } = {};
    public achievements: { [key: string]: Task } = {};
    public friends: { [key: string]: Friend } = {};

    private syncCallback?: () => void;
    private poisonCallback?: PoisonCallback;
    private abilityCallback?: AbilityCallback;
    private manaCallback?: ManaCallback;

    public constructor(instance: string) {
        super(instance, Modules.EntityType.Player);
    }

    /**
     * Loads the player based on the serialzied player
     * data sent from the server.
     * @param data Player data containing essentials.
     * @param sync Whether to sync the player.
     */

    public load(data: PlayerData, sync = false): void {
        this.instance = data.instance;
        this.name = data.name;
        this.level = data.level!;
        this.movementSpeed = data.movementSpeed!;
        this.orientation = data.orientation!;
        this.rank = data.rank!;
        this.attackRange = data.attackRange!;

        if (data.displayInfo) this.nameColour = data.displayInfo.colour!;

        this.setOrientation(data.orientation);

        if (!sync) this.setGridPosition(data.x, data.y);

        this.setHitPoints(data.hitPoints!, data.maxHitPoints);

        this.setMana(data.mana!, data.maxMana);

        if (data.equipments) _.each(data.equipments, this.equip.bind(this));
    }

    /**
     * Loads a batch of skills into the player's skill list.
     * @param skills Contains skill type, experience, and level
     * for each skill we are loading.
     */

    public loadSkills(skills: SkillData[]): void {
        _.each(skills, (skill: SkillData) => this.setSkill(skill));
    }

    /**
     * Loads batch of quest data from the server and inserts
     * it into the list of quests stored for the player.
     * @param quests An array of elements each containing quest info.
     */

    public loadQuests(quests: QuestData[]): void {
        for (let [i, quest] of quests.entries())
            this.quests[quest.key] = new Task(
                i,
                quest.name!,
                quest.description!,
                quest.stage,
                quest.stageCount!,
                quest.subStage,
                quest.rewards
            );
    }

    /**
     * Parses through the array data containing achievement information
     * and creates an object for each key as well as inserting preliminary data.
     * @param achievements Array containing information about each achievement.
     */

    public loadAchievements(achievements: AchievementData[]): void {
        for (let [i, achievement] of achievements.entries())
            this.achievements[achievement.key] = new Task(
                i,
                achievement.name!,
                achievement.description!,
                achievement.stage,
                achievement.stageCount!
            );
    }

    /**
     * Parses through the serialized ability data and creates a new ability object.
     * @param abilities List of abilities received from the server.
     */

    public loadAbilities(abilities: AbilityData[]): void {
        _.each(abilities, (ability: AbilityData) =>
            this.setAbility(ability.key, ability.level, ability.type, ability.quickSlot)
        );
    }

    /**
     * Loads the friend list from the server into the client.
     * @param friends Contains information about friend usernames and their online status.
     */

    public loadFriends(friends: FriendType): void {
        let i = 0;

        _.each(friends, (info: FriendInfo, username: string) => {
            this.friends[username] = new Friend(i, username, info.online, info.serverId);

            i++;
        });
    }

    /**
     * Equips the item based on the equipment type.
     * @param equipment Contains data about the equipment such as
     * type, name, count, ability, etc.
     */

    public equip(equipment: EquipmentData): void {
        let {
            type,
            name,
            key,
            count,
            enchantments,
            attackRange,
            attackStats,
            defenseStats,
            bonuses
        } = equipment;

        if (!key) return this.unequip(type);

        if (type === Modules.Equipment.Weapon) this.attackRange = attackRange || 1;

        this.equipments[type].update(
            key,
            name,
            count,
            enchantments,
            attackStats,
            defenseStats,
            bonuses
        );
    }

    /**
     * Adds a new friend to the list.
     * @param username The username of the friend.
     * @param status Whether the friend is online or not.
     */

    public addFriend(username: string, status: boolean, serverId: number): void {
        this.friends[username] = new Friend(_.size(this.friends), username, status, serverId);
    }

    /**
     * Calls an empty update() function onto the equipment slot
     * and resets it.
     * @param type Which equipment slot we are resetting.
     * @param count Optional parameter to remove a certain amount of items.
     */

    public unequip(type: Modules.Equipment, count = 0): void {
        // Decrement count if provided, otherwise reset the equipment slot.
        if (count > 0) this.equipments[type].count = count;
        else this.equipments[type].update();
    }

    /**
     * Signals to the callbacks that the player's data (experience, level, equipment)
     * has undergone a change. This updates the UI essentially.
     */

    public sync(): void {
        this.syncCallback?.();
    }

    /**
     * @returns The key of the currently equipped armour.
     */

    public getSpriteName(): string {
        return this.equipments[Modules.Equipment.Armour].key;
    }

    /**
     * @returns The armour object of the player.
     */

    public getArmour(): Armour {
        return this.equipments[Modules.Equipment.Armour];
    }

    /**
     * @returns The boots object of the player.
     */

    public getBoots(): Boots {
        return this.equipments[Modules.Equipment.Boots];
    }

    /**
     * @returns The arrows object of the player.
     */

    public getArrows(): Arrows {
        return this.equipments[Modules.Equipment.Arrows];
    }

    /**
     * @returns The pendant object of the player.
     */

    public getPendant(): Pendant {
        return this.equipments[Modules.Equipment.Pendant];
    }

    /**
     * @returns The ring object of the player.
     */

    public getRing(): Ring {
        return this.equipments[Modules.Equipment.Ring];
    }

    /**
     * @returns The weapon object of the player.
     */

    public getWeapon(): Weapon {
        return this.equipments[Modules.Equipment.Weapon];
    }

    /**
     * @returns Whether the player has the administrator rank.
     */

    public override isAdmin(): boolean {
        return this.rank === Modules.Ranks.Admin;
    }

    /**
     * @returns Whether the player has the moderator rank.
     */

    public override isModerator(): boolean {
        return this.rank === Modules.Ranks.Moderator;
    }

    /**
     * Adds up the experience from every skill and returns the total.
     * @returns Integer value of the total experience.
     */

    public getTotalExperience(): number {
        let total = 0;

        _.each(this.skills, (skill: Skill) => {
            total += skill.experience;
        });

        return total;
    }

    /**
     * @returns The key of the medal based on the player's medal type.
     */

    public getMedalKey(): string {
        switch (this.medal) {
            case Modules.Medals.Silver: {
                return 'silvermedal';
            }

            case Modules.Medals.Gold: {
                return 'goldmedal';
            }

            default: {
                return '';
            }
        }
    }

    /**
     * Updates the mana of the player.
     * @param mana The current amount of mana.
     * @param maxMana Optional parameter for the max mana.
     */

    public setMana(mana: number, maxMana?: number): void {
        this.mana = mana;

        if (maxMana) this.maxMana = maxMana;

        this.manaCallback?.(this.mana, maxMana || this.maxMana);
    }

    /**
     * Updates the experience of the skill or create a new one first if it doesn't exist.
     * @param arg0 Contains skill data such as type, experience, level, etc.
     */

    public setSkill({ type, experience, level, percentage }: SkillData): void {
        if (!this.skills[type]) this.skills[type] = new Skill(type);

        this.skills[type as Modules.Skills].update(experience, level!, percentage!);
    }

    /**
     * Updates data of the quest based on the key provided with the new stage and
     * substage information.
     * @param key The key of the quest we are updating.
     * @param stage The new stage of the quest.
     * @param subStage The new substage of the quest.
     */

    public setQuest(key: string, stage: number, subStage: number): void {
        this.quests[key]?.update(stage, subStage);
    }

    /**
     * Updates data about an achievement using the provided key.
     * @param key The key of the achievement we are updating.
     * @param stage The new stage of the achievement.
     * @param name The name of the achievement.
     * @param description The description of the achievement.
     */

    public setAchievement(key: string, stage: number, name: string, description: string): void {
        this.achievements[key]?.update(stage, undefined, name, description);
    }

    /**
     * Updates an ability's key and level.
     * @param key The key of the ability we are updating.
     * @param level The level of the ability.
     * @param type Optional parameter passed when we are creating a new ability.
     * @param quickSlot The id of the quickslot the ability is in.
     */

    public setAbility(
        key: string,
        level: number,
        type?: Modules.AbilityType,
        quickSlot = -1
    ): void {
        // This function is used when adding abilities for the first time too.
        if (key in this.abilities) this.abilities[key]?.update(level, quickSlot);
        else this.abilities[key] = new Ability(type!, key, level, quickSlot);

        // If any active ability is detected then we create a callback to display the quick slots.
        if (type === Modules.AbilityType.Active || quickSlot !== -1)
            this.abilityCallback?.(key, level, quickSlot);
    }

    /**
     * Updates the poison status of the player.
     * @param poison Poison status to update with.
     */

    public setPoison(poison: boolean): void {
        this.poison = poison;

        this.poisonCallback?.(poison);
    }

    /**
     * Updates the online status of a friend.
     * @param username The username of the friend we are updating.
     * @param status The online status of the friend.
     */

    public setFriendStatus(username: string, status: boolean): void {
        this.friends[username].online = status;
    }

    /**
     * Updates the active status of an ability.
     * @param key The key of the ability we are updating.
     */

    public toggleAbility(key: string): void {
        this.abilities[key]?.toggle();
    }

    /**
     * @returns If the weapon the player currently wields is a ranged weapon.
     */

    public isRanged(): boolean {
        return this.attackRange > 1;
    }

    /**
     * @returns Whether or not the player has a ranged-based magic weapon.
     */

    public isMagic(): boolean {
        return this.getWeapon().bonuses.magic > 0 && this.isRanged();
    }

    /**
     * @returns Whether or not the current weapon's key isn't an empty string.
     */

    public hasWeapon(): boolean {
        return this.equipments[Modules.Equipment.Weapon].exists();
    }

    /**
     * @returns Whether or not the player has a medal.
     */

    public override hasMedal(): boolean {
        return this.medal !== Modules.Medals.None;
    }

    /**
     * @returns Checks whether any of the keyboard directional
     * movement conditionals are true.
     */

    public hasKeyboardMovement(): boolean {
        return this.moveLeft || this.moveRight || this.moveUp || this.moveDown;
    }

    /**
     * Callback for when the poison status undergoes a change.
     * @param callback Contains information about the current poison status.
     */

    public onPoison(callback: PoisonCallback): void {
        this.poisonCallback = callback;
    }

    /**
     * Callback for whenever we want to synchronize
     * the player's data to the UI.
     */

    public onSync(callback: () => void): void {
        this.syncCallback = callback;
    }

    /**
     * Callback for when an active ability is added and we signal to the
     * client that we want to display the quick slots menu.
     */

    public onAbility(callback: AbilityCallback): void {
        this.abilityCallback = callback;
    }

    /**
     * Callback for when the player's mana changes.
     * @param callback Contains the current mana and max mana.
     */

    public onMana(callback: ManaCallback): void {
        this.manaCallback = callback;
    }
}
