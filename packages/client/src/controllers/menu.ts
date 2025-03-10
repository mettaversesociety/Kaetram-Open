import Actions from '../menu/actions';
import Inventory from '../menu/inventory';
import Bank from '../menu/bank';
import Store from '../menu/store';
import Header from '../menu/header';
import Profile from '../menu/profile/profile';
import Enchant from '../menu/enchant';
import Warp from '../menu/warp';
import Notification from '../menu/notification';
import Settings from '../menu/settings';
import QuickSlots from '../menu/quickslots';
import Equipments from '../menu/equipments';
import Achievements from '../menu/achievements';
import Quests from '../menu/quests';
import Friends from '../menu/friends';
import Trade from '../menu/trade';
import Interact from '../menu/interact';

import { Modules, Opcodes, Packets } from '@kaetram/common/network';
import _ from 'lodash-es';

import type Game from '../game';
import type Menu from '../menu/menu';
import type Entity from '../entity/entity';

export default class MenuController {
    private actions: Actions = new Actions();
    private interact: Interact = new Interact();

    private inventory: Inventory;
    private bank: Bank;
    private store: Store;
    private profile: Profile;
    private enchant: Enchant;
    private warp: Warp;
    private notification: Notification;
    private settings: Settings;
    private equipments: Equipments;
    private achievements: Achievements;
    private quests: Quests;
    private friends: Friends;
    private trade: Trade;

    public header: Header;

    public menus: { [key: string]: Menu };

    public constructor(private game: Game) {
        this.inventory = new Inventory(this.actions);
        this.bank = new Bank(this.inventory);
        this.store = new Store(this.inventory);
        this.profile = new Profile(game.player);
        this.enchant = new Enchant();
        this.warp = new Warp(game.socket);
        this.notification = new Notification();
        this.settings = new Settings(game);
        this.header = new Header(game.player);
        this.equipments = new Equipments(game.player, game.sprites);
        this.achievements = new Achievements(game.player);
        this.quests = new Quests(game.player);
        this.friends = new Friends(game.player);
        this.trade = new Trade();

        this.menus = {
            inventory: this.inventory,
            bank: this.bank,
            store: this.store,
            profile: this.profile,
            enchant: this.enchant,
            warp: this.warp,
            notification: this.notification,
            settings: this.settings,
            equipments: this.equipments,
            achievements: this.achievements,
            quests: this.quests,
            friends: this.friends,
            trade: this.trade,
            interact: this.interact
        };

        this.inventory.onSelect(this.handleInventorySelect.bind(this));
        this.bank.onSelect(this.handleBankSelect.bind(this));
        this.store.onSelect(this.handleStoreSelect.bind(this));
        this.equipments.onSelect(this.handleProfileUnequip.bind(this));

        this.profile.onUnequip(this.handleProfileUnequip.bind(this));
        this.profile.onAbility(this.handleAbility.bind(this));

        this.warp.onSelect(this.handleWarp.bind(this));

        this.friends.onConfirm(this.handleFriendConfirm.bind(this));

        this.trade.onClose(this.handleTradeClose.bind(this));

        this.load();
    }

    /**
     * Initializes the header and a callback that automatically
     * hides all the other menus when a menu is shown.
     */

    private load(): void {
        new QuickSlots(this.game.player);

        this.forEachMenu((menu: Menu) => menu.onShow(() => this.hide()));
    }

    /**
     * Iterates through all menus and calls the hide function.
     * This is used when we want to hide every user interface.
     */

    public hide(): void {
        this.forEachMenu((menu: Menu) => menu.hide());
    }

    /**
     * Synchronizes the contains and the UI for all menus.
     * @param key Optional key to synchronize a specific menu.
     */

    public synchronize(key?: string): void {
        if (key) return this.menus[key]?.synchronize();

        this.forEachMenu((menu: Menu) => menu.synchronize());
    }

    /**
     * Calls every menu's resize function if it is initialized.
     */

    public resize(): void {
        this.header.resize(); // Non Menu UI (for now?)

        this.forEachMenu((menu: Menu) => menu.resize());
    }

    /**
     * @returns The interact menu object.
     */

    public getInteract(): Interact {
        return this.interact;
    }

    /**
     * @returns The inventory menu object.
     */

    public getInventory(): Inventory {
        return this.inventory;
    }

    /**
     * @returns The bank menu object.
     */

    public getBank(): Bank {
        return this.bank;
    }

    /**
     * @returns The store menu object.
     */

    public getStore(): Store {
        return this.store;
    }

    /**
     * @returns The profile menu object.
     */

    public getProfile(): Profile {
        return this.profile;
    }

    /**
     * @returns The notification menu object.
     */

    public getNotification(): Notification {
        return this.notification;
    }

    /**
     * @returns The enchant menu object.
     */

    public getEnchant(): Enchant {
        return this.enchant;
    }

    /**
     * @returns The warp menu object
     */

    public getWarp(): Warp {
        return this.warp;
    }

    /**
     * @returns The achievement menu object.
     */

    public getAchievements(): Achievements {
        return this.achievements;
    }

    /**
     * @returns The quests menu object.
     */

    public getQuests(): Quests {
        return this.quests;
    }

    /**
     * @returns The friends menu object.
     */

    public getFriends(): Friends {
        return this.friends;
    }

    /**
     * Callback handler for when an item in the inventory is selected.
     * @param index Index of the item selected.
     * @param opcode Opcode identifying the type of action performed on the item.
     * @param value Optional parameter passed when we specify a selected slot to swap with.
     */

    private handleInventorySelect(index: number, opcode: Opcodes.Container, value?: number): void {
        this.game.socket.send(Packets.Container, {
            opcode,
            type: Modules.ContainerType.Inventory,
            index,
            value
        });
    }

    /**
     * Callback handler for when an item in the bank is selected.
     * @param type Indicates which container (inventory or bank) was selected.
     * @param index The index within that container.
     */

    private handleBankSelect(type: Modules.ContainerType, index: number): void {
        this.game.socket.send(Packets.Container, {
            opcode: Opcodes.Container.Select,
            type: Modules.ContainerType.Bank,
            subType: type,
            index
        });
    }

    /**
     * Callback for when a store selection occurs. This is the packet format for when
     * an item in the inventory is selected, when it is sold, or when we are attempting
     * to purchase an item from the store.
     * @param opcode The type of action we are performing.
     * @param key The key of the store that we are in.
     * @param index The index of the item (whether in the inventory or store).
     */

    private handleStoreSelect(opcode: Opcodes.Store, key: string, index: number, count = 1): void {
        this.game.socket.send(Packets.Store, {
            opcode,
            key,
            index,
            count
        });
    }

    /**
     * Callback received from one of the profile pages when
     * an equipment slot is clicked. We send a packet to the
     * server requesting unequipping.
     * @param type What slot is being unequipped.
     */

    private handleProfileUnequip(type: Modules.Equipment): void {
        this.game.socket.send(Packets.Equipment, {
            opcode: Opcodes.Equipment.Unequip,
            type
        });
    }

    /**
     * Callback for when an action within the abilities menu occurs.
     * Generally this will consist of activating an ability or dragging it
     * into the quick slot menu.
     * @param type The type of action we are performing (using ability or dragging it to a quickslot).
     * @param key The key of the ability we are performing an action on.
     * @param index The index of the quickslot we are dragging to (only specified when dragging).
     */

    private handleAbility(type: Opcodes.Ability, key: string, index?: number): void {
        this.game.socket.send(Packets.Ability, {
            opcode: type,
            key,
            index
        });
    }

    /**
     * Sends a packet to the server about the warp that was just selected.
     * @param id The id of the warp that was selected.
     */

    private handleWarp(id: number): void {
        this.game.socket.send(Packets.Warp, {
            id
        });
    }

    /**
     * Sends a packet to the server with the type of friend action we are performing. If the
     * `remove` variable is set to false then we are adding a friend, otherwise we are removing.
     * @param username The username we are performing the action on.
     * @param remove (Optional) Whether we are removing a friend or not (default: false).
     */

    private handleFriendConfirm(username: string, remove = false): void {
        this.game.socket.send(Packets.Friends, {
            opcode: remove ? Opcodes.Friends.Remove : Opcodes.Friends.Add,
            username
        });
    }

    /**
     * Sends a tade packet to the server indicating that the session has been closed.
     */

    private handleTradeClose(): void {
        this.game.socket.send(Packets.Trade, [Opcodes.Trade.Close]);
    }

    /**
     * Iterates through all the menus and passes a callback.
     * @param callback Current menu being iterated through.
     */

    private forEachMenu(callback: (menu: Menu) => void): void {
        _.each(this.menus, callback);
    }
}
