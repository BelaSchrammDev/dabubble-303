/**
 * @file Channel Service
 * @description This service handles the addition of new channels to the database.
 * @author Bela Schramm
 */

import { inject, Injectable, OnDestroy } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  Firestore,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { UsersService } from './user.service';
import { Channel } from '../../shared/models/channel.class';
import { Chat } from '../../shared/models/chat.class';
import { User } from '../../shared/models/user.class';
import { BehaviorSubject } from 'rxjs';
import { Message } from '../../shared/models/message.class';
import { getCollectionPath } from '../firebase/utils';

/**
 * @class ChannelService
 * @description Service that handles the retrieval and addition of channels to the database.
 * @author Bela Schramm
 */
@Injectable({
  providedIn: 'root',
})
export class ChannelService implements OnDestroy {
  public defaultChannel: Channel = new Channel({
    name: 'Willkommen',
    description: 'Defaultchannel',
    defaultChannel: true,
  });

  private subscribeUserListChange: any;

  private chatListChange = new BehaviorSubject<Chat[]>([]);
  public chatListChange$ = this.chatListChange.asObservable();

  public chats: Chat[] = [];
  private unsubChats: any = null;

  /**
   * @description Firestore instance.
   * @type {Firestore}
   */
  private firestore: Firestore = inject(Firestore);

  /**
   * @description Users service instance.
   * @type {UsersService}
   */
  private userservice: UsersService = inject(UsersService);
  private currentUserSubscription: any;

  /**
   * @description Unsubscribe function for the channels subscription.
   * @type {any}
   */
  private unsubChannels: any;

  /**
   * @description List of channels.
   * @type {Channel[]}
   */
  public channels: Channel[] = [this.defaultChannel];

  /**
   * @constructor
   * @description Constructor that subscribes to the channels collection.
   */
  constructor() {
    this.initChannelCollection();
    this.initChatCollection();
    this.subscribeUserListChange = this.userservice.changeUserList$.subscribe(
      () => {
        this.defaultChannel.update({
          members: this.userservice.getAllUserIDs(),
        });
      }
    );
    this.currentUserSubscription = this.userservice.changeCurrentUser$.subscribe((type) => {
      if (type === 'login') {
        setTimeout(() => {
          this.calculateUnreadMessagesCountForAllChannelsAndChats();
        }, 1000);
      }
    });
  }

  private initChannelCollection(): void {
    this.unsubChannels = onSnapshot(
      collection(this.firestore, '/channels'),
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const channel = new Channel(change.doc.data(), change.doc.id);
            this.channels.push(channel);
          }
          if (change.type === 'modified') {
            const channel = this.channels.find(
              (channel) => channel.id === change.doc.id
            );
            if (channel) {
              channel.update(change.doc.data());
            }
          }
          if (change.type === 'removed') {
            this.channels = this.channels.filter(
              (channel) => channel.id !== change.doc.id
            );
          }
        });
      }
    );
  }


  public calculateUnreadMessagesCountForAllChannelsAndChats() {
    this.channels.forEach((channel) => {
      if (!channel.defaultChannel) this.calculateUnreadMessagesCount(channel);
    });
    this.chats.forEach((chat) => {
      if (chat.memberIDs.includes(this.userservice.currentUserID)) this.calculateUnreadMessagesCount(chat);
    });
  }


  public async calculateUnreadMessagesCount(channel: Channel | Chat | Message) {
    const lrm = this.userservice.getLastReadMessageObject(channel);
    const lastViewTime: Date = new Date();
    lastViewTime.setTime(lrm ? lrm.messageCreateAt : this.userservice.currentUser?.signupAt.getTime() || 0);
    const firestoreTimestamp = Timestamp.fromDate(lastViewTime);
    const collectionRef = collection(this.firestore, getCollectionPath(channel));
    const querySnapshot = await getDocs(
      query(collectionRef, where('createdAt', '>', lastViewTime))
    );
    channel.unreadMessagesCount = querySnapshot.size;
    // if (channel instanceof Channel) console.log('Channel: ' + channel.name + ' / unreadMessagesCount: ' + channel.unreadMessagesCount);
    // else if (channel instanceof Message) console.log('Message: ' + channel.id + ' / unreadMessagesCount: ' + channel.unreadMessagesCount);
    // else {
    //   const chatPartner = this.getChatPartner(channel);
    //   console.log('Chat: ' + channel.id + ' / ' + (chatPartner ? chatPartner.name : 'Unbekannt') + ' / unreadMessagesCount: ' + channel.unreadMessagesCount);
    // }
  }


  private initChatCollection(): void {
    this.unsubChats = onSnapshot(
      collection(this.firestore, '/chats'),
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added')
            this.chats.push(
              new Chat(change.doc.data(), change.doc.id)
            );
          if (change.type === 'modified') {
            const chat = this.chats.find(
              (chat) => chat.id === change.doc.id
            );
            if (chat) chat.update(change.doc.data());
          }

          if (change.type === 'removed')
            this.chats = this.chats.filter(
              (chat) => chat.id !== change.doc.data()['id']
            );
        });
        this.chatListChange.next(this.chats);
      }
    );
  }

  getChatByID(chatID: string): Chat | undefined {
    return this.chats.find((chat) => chat.id === chatID);
  }

  getChatPartner(chat: Chat): User | undefined {
    if (this.userservice.currentUser) {
      if (chat.memberIDs[0] === this.userservice.currentUserID)
        return this.userservice.getUserByID(chat.memberIDs[1]);
      else return this.userservice.getUserByID(chat.memberIDs[0]);
    }
    return undefined;
  }


  getChatWithUserByID(selectedUserID: string): Chat | undefined {
    if (this.userservice.currentUser) {
      let selectedChat: Chat | undefined = undefined;
      if (this.userservice.currentUserID === selectedUserID)
        selectedChat = this.chats.find(
          (selectedChat) => selectedChat.memberIDs[0] === selectedUserID && selectedChat.memberIDs[1] === selectedUserID
        );
      else selectedChat = this.chats.find((selectedChat) => selectedChat.memberIDs.includes(selectedUserID) && selectedChat.memberIDs.includes(this.userservice.currentUserID));
      if (selectedChat) return selectedChat;
    }
    return;
  }


  getChatWithUserByName(selectedUserName: string): Chat | undefined {
    const selectedUser = this.userservice.getUserByName(selectedUserName);
    if (selectedUser) return this.getChatWithUserByID(selectedUser.id);
    return;
  }


  getChannelByName(channelName: string): Channel | undefined {
    return this.channels.find((channel) => channel.name === channelName) || undefined;
  }


  ifCurrentUserMemberOfChannelByName(channel: string): boolean {
    const channelObj = this.getChannelByName(channel);
    if (channelObj) return channelObj.memberIDs.includes(this.userservice.currentUserID);
    return false;
  }


  /**
   * Adds a new chat with a specified user to Firestore.
   * 
   * This method creates a new chat document in the Firestore 'chats' collection,
   * including the current user's ID and the specified user's ID. It also updates
   * the current user's and the specified user's chat IDs in Firestore.
   * 
   * @param userID - The ID of the user to chat with.
   * @returns A promise that resolves to the chat ID if the chat is successfully created, or undefined if an error occurs.
   * 
   * @throws Will log an error message if there is an issue adding the chat to Firestore.
   */
  async addChatWithUserOnFirestore(userID: string): Promise<string | undefined> {
    try {
      const chatRef = collection(this.firestore, '/chats');
      const chatObj = { memberIDs: [this.userservice.currentUserID, userID], createdAt: serverTimestamp() };
      const chat = await addDoc(chatRef, chatObj);
      this.userservice.updateCurrentUserDataOnFirestore({ chatIDs: [...(this.userservice.currentUser?.chatIDs || []), chat.id] });
      if (this.userservice.currentUserID !== userID) {
        const user = this.userservice.getUserByID(userID);
        let userChatIDs = user?.chatIDs;
        userChatIDs?.push(chat.id);
        this.userservice.updateUserDataOnFirestore(userID, { chatIDs: userChatIDs });
      }
      return chat.id;
    } catch (error) {
      console.error('userservice/chat: Error adding chat(' + (error as Error).message + ')');
      return undefined;
    }
  }


  /**
   * Adds a new channel to Firestore with the specified name, description, and member IDs.
   *
   * @param {string} name - The name of the new channel.
   * @param {string} description - A brief description of the new channel.
   * @param {string[]} membersIDs - An array of user IDs who will be members of the new channel.
   * @returns {Promise<boolean>} - A promise that resolves to `true` if the channel was added successfully, or `false` if there was an error.
   */
  async addNewChannelToFirestore(name: string, description: string, membersIDs: string[]): Promise<boolean> {
    const newchannel = {
      name: name,
      description: description,
      memberIDs: membersIDs,
      createdAt: serverTimestamp(),
      creatorID: this.userservice.currentUserID,
    };
    try {
      await addDoc(collection(this.firestore, '/channels'), newchannel);
      return true;
    } catch (error) {
      console.error('ChannelService: addNewChannelToFirestore: error adding channel' + newchannel.name + ' # ', error);
      return false;
    }
  }


  /**
   * Updates a channel document in Firestore with the provided update data.
   *
   * @param channel - The channel object containing the ID of the channel to update.
   * @param updateData - An object containing the fields to update. Possible fields are:
   *  - `name` (optional): The new name of the channel.
   *  - `description` (optional): The new description of the channel.
   *  - `memberIDs` (optional): An array of member IDs to update the channel with.
   * @returns A promise that resolves when the update operation is complete.
   * @throws Will log an error message if the update operation fails.
   */
  async updateChannelOnFirestore(channel: Channel, updateData: { name?: string; description?: string; memberIDs?: string[] }) {
    const channelDocRef = doc(this.firestore, '/channels', channel.id);
    try {
      await updateDoc(channelDocRef, updateData);
    } catch (error) {
      console.error('ChannelService: updateChannelOnFirestore: error updating channel ->', error);
    }
  }


  /**
   * Checks if a channel name is a duplicate of an existing channel name, optionally excluding the original channel name.
   * @param channelName - The name of the channel to check for duplicates.
   * @param originalChannelName - The original name of the channel, used to determine if the new name is a change.
   * @param originalChannelNameRequired - to difference when methode called by channel creation or edition.
   * @returns True if the channel name is a duplicate, false otherwise.
   */
  checkForDuplicateChannelName(channelName: string, originalChannelName: string, originalChannelNameRequired = true): boolean {
    const isDuplicate = this.channels.some((channel) => channel.name.toLowerCase() === channelName.toLowerCase());
    if (originalChannelNameRequired) {
      const isChanged = channelName.toLowerCase() !== originalChannelName.toLowerCase();
      return isDuplicate && isChanged;
    } else return isDuplicate;
  }


  /**
   * Lifecycle hook that is called when the component is about to be destroyed.
   * Unsubscribes from channels and unsubscribes from user list change subscription.
   */
  ngOnDestroy(): void {
    if (this.unsubChannels) this.unsubChannels();
    if (this.subscribeUserListChange)
      this.subscribeUserListChange.unsubscribe();
    if (this.unsubChats) this.unsubChats();
  }
}
