import {
  Component,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
} from '@angular/core';
import { MessageDateComponent } from './messages-list-view/message-date/message-date.component';
import { MessageTextareaComponent } from '../message-textarea/message-textarea.component';
import { CommonModule } from '@angular/common';
import { MessageComponent } from './messages-list-view/message/message.component';
import { PopoverChannelEditorComponent } from './popover-chatview/popover-channel-editor/popover-channel-editor.component';
import { PopoverChannelMemberOverviewComponent } from './popover-chatview/popover-channel-member-overview/popover-channel-member-overview.component';
import { NavigationService } from '../../utils/services/navigation.service';
import { Channel } from '../../shared/models/channel.class';
import { Chat } from '../../shared/models/chat.class';
import { Message } from '../../shared/models/message.class';
import { MessagesListViewComponent } from './messages-list-view/messages-list-view.component';
import { UsersService } from '../../utils/services/user.service';
import { MessageGreetingComponent } from './messages-list-view/message-greeting/message-greeting.component';
import { AvatarDirective } from '../../utils/directives/avatar.directive';
import { PopoverMemberProfileComponent } from './popover-chatview/popover-member-profile/popover-member-profile.component';
import { BehaviorSubject } from 'rxjs';
import { ChannelService } from '../../utils/services/channel.service';
import { User } from '../../shared/models/user.class';
import { ifChatWhitSelf } from '../../utils/firebase/utils';

@Component({
  selector: 'app-chatview',
  standalone: true,
  imports: [
    CommonModule,
    MessageDateComponent,
    MessageComponent,
    MessageTextareaComponent,
    PopoverChannelEditorComponent,
    PopoverChannelMemberOverviewComponent,
    PopoverChannelMemberOverviewComponent,
    MessagesListViewComponent,
    MessageGreetingComponent,
    AvatarDirective,
    PopoverMemberProfileComponent,
  ],
  templateUrl: './chatview.component.html',
  styleUrl: './chatview.component.scss',
})
export class ChatviewComponent implements OnInit {

  @Input() set currentContext(value: Channel | Chat) {
    this.showEmptyChannelState = false;
    this.channelSubject.next(value);
  }

  get currentContext(): Channel | Chat {
    return this.channelSubject.getValue();
  }

  public navigationService = inject(NavigationService);
  public userService = inject(UsersService);
  public channelService = inject(ChannelService);
  public isAChannel = false;
  public isAChat = false;
  public isDefaultChannel = true;
  public showEmptyChannelState = false;
  public requiredAvatars: string[] = [];

  memberList = false;
  addMemberPopover = false;

  public channelSubject = new BehaviorSubject<Channel | Chat>(
    this.navigationService.chatViewObject
  );
  channel$ = this.channelSubject.asObservable();

  constructor() { }

  ngOnInit() {
    this.channel$.subscribe(() => {
      this.setContext();
      this.getRequiredAvatars();
    });
  }

  /**
   * Sets the context of the current view based on the type of the `currentContext` object.
   * 
   * If the `currentContext` is an instance of `Channel` and it is the default channel,
   * `isDefaultChannel` is set to `true`, otherwise it is set to `false`.
   * 
   * If the `currentContext` is an instance of `Channel`, `isAChannel` is set to `true`,
   * otherwise it is set to `false`.
   * 
   * If the `currentContext` is an instance of `Chat`, `isAChat` is set to `true`,
   * otherwise it is set to `false`.
   * 
   * is used to differency if user is currently in a channel or in a chat.
   */
  setContext() {
    this.isDefaultChannel = this.currentContext === this.channelService.defaultChannel;
    this.isAChannel = this.currentContext instanceof Channel;
    this.isAChat = this.currentContext instanceof Chat;
  }

  onMessagesLoaded(count: number): void {
    this.showEmptyChannelState = count === 0;
  }


  /**
   * Gets the title of a given Channel, Chat, or Message object.
   *
   * @param object - The Channel, Chat, or Message object to get the title for.
   * @returns The title of the object, or an empty string if the object is not a Channel.
   */
  getTitle(object: Channel | Chat | Message | undefined): string {
    if (object instanceof Channel) return object.name;
    return '';
  }

  /**
   * Gets the chat partner for the given Chat object.
   *
   * This method finds the chat partner ID by looking for an ID that is not the current user's ID. It then returns the user object for that chat partner ID.
   *
   * If the current context is a chat with the current user, this method returns the user object for the first member ID in the chat.
   *
   * @param object - The Chat or Channel object to get the chat partner for.
   * @returns The user object for the chat partner, or `undefined` if the current context is not a Chat.
   */
  getChatPartner(object: Chat | Channel) {
    if (this.currentContext instanceof Chat) {
      const chatPartnerID = object.memberIDs.find(
        (id) => id !== this.userService.currentUser?.id
      );
      if (chatPartnerID) return this.userService.getUserByID(chatPartnerID);
      if (object instanceof Chat && ifChatWhitSelf(object))
        return this.userService.getUserByID(object.memberIDs[0]);
    }
    return undefined;
  }

  /**
   * Gets the name of the chat partner for the current context.
   *
   * If the current chat partner is not the current user, this method returns the name of the chat partner.
   * If the current chat partner is the current user, this method returns the name of the first member in the chat followed by "(You)".
   *
   * @returns The name of the chat partner, or an empty string if the current context is not a chat.
   */
  returnChatPartnerName() {
    const chatPartner = this.currentContext.memberIDs.find(
      (id) => id !== this.userService.currentUser?.id
    );
    if (chatPartner) return this.userService.getUserByID(chatPartner)?.name;
    else
      return `${this.userService.getUserByID(this.currentContext.memberIDs[0])?.name
        } (Du)`;
  }

  /**
   * Checks if the current context is a chat with the current user.
   *
   * @returns `true` if the current context is a chat with the current user, `false` otherwise.
   * Is used as condition to show different content in template.
   */
  isSelfChat(): boolean {
    return this.currentContext instanceof Chat && ifChatWhitSelf(this.currentContext);
  }

  /**
   * Gets the number of members in the given Channel.
   *
   * If the object is a Channel, this method returns the length of the `memberIDs` array.
   *
   * @param object - The Channel or Chat object to get the number of members for.
   * @returns The number of members in the Channel, or `undefined` if the object is a Chat.
   */
  getNumberOfMembers(object: Channel | Chat) {
    if (object instanceof Channel) return object.memberIDs.length;
    return;
  }

  /**
   * Gets the required avatars to display for the current channel context.
   *
   * If the current context is a Channel, this method first sorts the memberIDs array
   * to move the current user's ID to the front. Then, it slices the first 3 memberIDs
   * and assigns them to the `requiredAvatars` property.
   */
  getRequiredAvatars() {
    if (this.currentContext instanceof Channel) {
      this.sortAvatarsArray();
      this.requiredAvatars = this.currentContext.memberIDs.slice(0, 3);
    }
  }

  /**
   * Sorts the `memberIDs` array of the current channel context, moving the current user's ID to the front.
   *
   * This method is used to ensure that the current user's avatar is always displayed first in the list of channel members.
   */
  sortAvatarsArray() {
    if (
      this.currentContext instanceof Channel &&
      this.currentUserIsChannelMember()
    ) {
      let currentUserIndex = this.currentContext.memberIDs.indexOf(
        this.userService.currentUser!.id
      );
      this.currentContext.memberIDs.splice(currentUserIndex, 1);
      this.currentContext.memberIDs.unshift(this.userService.currentUser!.id);
    }
  }

  /**
   * Checks if the current user is a member of the current channel context.
   * @returns `true` if the current user is a member of the current channel, `false` otherwise.
   */
  currentUserIsChannelMember() {
    return (
      this.currentContext instanceof Channel &&
      this.currentContext.memberIDs.includes(this.userService.currentUser!.id)
    );
  }

  /**
   * Gets the name of the creator of the given Channel object.
   * If the current user is the creator, it returns "Du hast ('You have' in German)". Otherwise, it returns the name of the creator + "hat" ('has' in German).
   * @param object The Channel object to get the creator name for.
   * @returns The name of the creator, or an empty string if the object is a Chat.
   */
  getChannelCreatorName(object: Channel | Chat): string {
    if (object instanceof Channel) {
      let channelCreator = this.userService.getUserByID(object.creatorID);
      if (object.creatorID === this.userService.currentUserID) {
        return 'Du hast';
      } else {
        return `${channelCreator!.name} hat`;
      }
    }
    return '';
  }

  /**
   * Gets the formatted creation time of the given Channel or Chat object.
   * If the object is a Channel, it returns the formatted creation time of the Channel. Otherwise, it returns an empty string.
   * @param object The Channel or Chat object to get the creation time for.
   * @returns The formatted creation time of the Channel, or an empty string if the object is a Chat.
   */
  getChannelCreationTime(object: Channel | Chat): string {
    if (object instanceof Channel) {
      let channelCreationTime = this.formatDate(object.createdAt);
      return channelCreationTime;
    }
    return '';
  }

  /**
   * Formats a given date into a localized string representation.
   * If the date is today, it returns the string "Heute" (German for "Today").
   * Otherwise, it returns the date formatted as a long weekday, day, and month.
   * @param date The date to format.
   * @returns The formatted date string.
   */
  formatDate(date: Date) {
    let formatedMessageDate = date.toLocaleString('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    if (formatedMessageDate == this.isToday()) return 'Heute';
    else {
      return formatedMessageDate;
    }
  }

  /**
   * Gets the formatted string representation of the current date.
   * If the current date is today, it returns the string "Heute" (German for "Today").
   * Otherwise, it returns the date formatted as a long weekday, day, and month.
   * @returns The formatted date string.
   */
  isToday() {
    const today = new Date();
    let formatedTodaysDate = today.toLocaleString('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return formatedTodaysDate;
  }

  /**
   * Opens a popover menu to display either the member list or the add member popover.
   * The state of the `memberList` and `addMemberPopover` properties are updated based on the `popover` parameter.
   * The `currentContext` property is also set to the `chatViewObject` from the `navigationService`.
   * @param popover The name of the popover to open, either 'memberList' or 'addMember'.
   */
  openMemberListPopover(popover: string) {
    this.memberList = false;
    this.addMemberPopover = false;
    popover === 'memberList'
      ? (this.memberList = true)
      : (this.memberList = false);
    popover === 'addMember'
      ? (this.addMemberPopover = true)
      : (this.addMemberPopover = false);
    this.currentContext = this.navigationService.chatViewObject;
  }

  /**
   * Checks if the current user is allowed to add members to the current chat context.
   * If the current context is a Channel, the user is allowed to add members if they are the creator or a member of the channel.
   * @returns `true` if the current user is allowed to add members, `false` if not, or `undefined` if the current context is not a Channel.
   */
  isAllowedToAddMember() {
    if (this.currentContext instanceof Channel) {
      return (
        this.currentContext.creatorID === this.userService.currentUserID ||
        this.currentContext.memberIDs.includes(this.userService.currentUserID)
      );
    }
    return;
  }

  /**
   * Checks if the current user is allowed to add members to the current chat context, and returns a message if they are not allowed.
   * @returns An empty string if the user is allowed to add members, or a message indicating they are not allowed.
   */
  showNoRightToEditInfo() {
      if (!this.isAllowedToAddMember()) {
        return 'Du bist nicht befugt, neue Leute einzuladen.';
      }
      return '';
    }
 

  /**
   * Sets the selected user object in the user service and updates the navigation service to target the profile.
   * @param selectedUserID - The ID of the user to set as the selected user.
   */
  setSelectedUserObject(selectedUserID: string) {
    this.userService.updateSelectedUser(this.userService.getUserByID(selectedUserID));
    this.navigationService.setProfileTarget(true);
  }

  /**
   * Gets the ID of the chat partner for the given chat or channel.
   * If the current user is a member of the chat/channel, this method returns the ID of the other member.
   * @param chat - The chat or channel object to get the chat partner ID for.
   * @returns The ID of the chat partner, or `undefined` if the current user is not a member of the chat/channel.
   */
  getChatPartnerID(chat: Chat | Channel): string | undefined {
    if (this.userService.currentUser) {
      if (chat.memberIDs[0] === this.userService.currentUserID)
        return chat.memberIDs[1];
      else return chat.memberIDs[0];
    }
    return;
  }




}