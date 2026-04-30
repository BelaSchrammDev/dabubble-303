import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { IReactions, Message, StoredAttachment } from '../../shared/models/message.class';
import { Channel } from '../../shared/models/channel.class';
import { Chat } from '../../shared/models/chat.class';
import { ApiService } from './api.service';
import { UsersService } from './user.service';
import { EmojipickerService } from './emojipicker.service';
import { environment } from '../../../environments/environment';

export type MessageAttachment = {
  name: string;
  src: any;
  size: number;
  lastModified: number;
  file: any;
};

/** Leitet aus dem collectionPath die Backend-Basis-URL ab.
 *  collectionPath-Beispiele:
 *    'channels/{id}/messages/'          → /channels/{id}/messages
 *    'chats/{id}/messages/'             → /chats/{id}/messages
 *    'channels/{id}/messages/{mid}/answers/' → /channels/{id}/messages/{mid}/answers
 */
function apiPathFromCollectionPath(collectionPath: string): string {
  return '/' + collectionPath.replace(/\/$/, '');
}

function removeHTMLTags(str: string): string {
  return str.replace(/<\/?[^>]+(>|$)/g, ' ').trim();
}

@Injectable({ providedIn: 'root' })
export class MessageService {
  private api = inject(ApiService);
  private userservice = inject(UsersService);
  private emojiService = inject(EmojipickerService);

  // ── Nachrichten laden ─────────────────────────────────────────────────────

  async getMessages(
    collectionObject: Channel | Chat | Message,
    limit?: number,
    offset?: number,
  ): Promise<{ messages: Message[]; total: number }> {
    let apiPath: string;
    let collPath: string;

    if (collectionObject instanceof Channel) {
      apiPath = `/channels/${collectionObject.id}/messages`;
      collPath = `channels/${collectionObject.id}/messages/`;
    } else if (collectionObject instanceof Chat) {
      apiPath = `/chats/${collectionObject.id}/messages`;
      collPath = `chats/${collectionObject.id}/messages/`;
    } else {
      apiPath = `/${collectionObject.messagePath}/answers`;
      collPath = collectionObject.messagePath + '/answers/';
    }

    if (limit !== undefined) {
      apiPath += `?limit=${limit}&offset=${offset ?? 0}`;
    }

    try {
      const data = await firstValueFrom(this.api.get<any>(apiPath));
      if (Array.isArray(data)) {
        return { messages: data.map((m) => new Message(m, collPath, m.id)), total: data.length };
      }
      return {
        messages: (data.messages as any[]).map((m) => new Message(m, collPath, m.id)),
        total: data.total as number,
      };
    } catch (error) {
      console.error('MessageService: getMessages', error);
      return { messages: [], total: 0 };
    }
  }

  // ── Neue Nachricht senden ─────────────────────────────────────────────────

  async addNewMessageToCollection(
    collectionObject: Channel | Chat | Message,
    messageContent: string,
    attachments: MessageAttachment[] = [],
    creatorID: string = this.userservice.currentUserID,
    _createdAt?: Date,
  ): Promise<string> {
    try {
      let apiPath: string;
      if (collectionObject instanceof Channel) {
        apiPath = `/channels/${collectionObject.id}/messages`;
      } else if (collectionObject instanceof Chat) {
        apiPath = `/chats/${collectionObject.id}/messages`;
      } else {
        // Thread-Antwort
        apiPath = `/${collectionObject.messagePath}/answers`;
      }

      const body: any = {
        content: messageContent,
        plainContent: removeHTMLTags(messageContent),
        answerable: !(collectionObject instanceof Message),
        creatorID,
      };

      const created = await firstValueFrom(this.api.post<any>(apiPath, body));

      if (attachments.length > 0) {
        await this.uploadAttachments(created.id, apiPath, attachments);
      }
      return '';
    } catch (error) {
      console.error('MessageService: addNewMessageToCollection', error);
      return (error as Error).message;
    }
  }

  // ── Nachricht bearbeiten ──────────────────────────────────────────────────

  async updateMessage(
    message: Message,
    updateData: { content: string; plainContent?: string; edited?: boolean; editedAt?: any },
  ): Promise<void> {
    if (!updateData.content || updateData.content === message.content) return;
    try {
      const apiPath = this.messageToApiPath(message);
      await firstValueFrom(this.api.patch(apiPath, {
        content: updateData.content,
        plainContent: removeHTMLTags(updateData.content),
      }));
    } catch (error) {
      console.error('MessageService: updateMessage', error);
    }
  }

  // ── Nachricht löschen ─────────────────────────────────────────────────────

  async deleteMessage(message: Message, _collectionObject?: Channel | Chat | Message): Promise<string> {
    try {
      const apiPath = this.messageToApiPath(message);
      await firstValueFrom(this.api.delete(apiPath));
      return '';
    } catch (error) {
      console.error('MessageService: deleteMessage', error);
      return (error as Error).message;
    }
  }

  // ── Reaktionen ────────────────────────────────────────────────────────────

  async toggleReactionToMessage(message: Message, emoji: string): Promise<boolean> {
    try {
      const apiPath = this.messageToApiPath(message) + '/reactions';
      await firstValueFrom(this.api.post(apiPath, { emoji }));
      this.emojiService.addEmojiToUserEmojis(emoji);
      return true;
    } catch (error) {
      console.error('MessageService: toggleReactionToMessage', error);
      return false;
    }
  }

  // ── Anhänge ───────────────────────────────────────────────────────────────

  private async uploadAttachments(messageId: string, _apiPath: string, attachments: MessageAttachment[]): Promise<void> {
    for (const attachment of attachments) {
      const formData = new FormData();
      formData.append('file', attachment.file, attachment.name);
      formData.append('messageId', messageId);
      try {
        await firstValueFrom(this.api.postFormData('/uploads/attachment', formData));
      } catch (error) {
        console.error('MessageService: uploadAttachment', attachment.name, error);
      }
    }
  }

  async deleteStoredAttachment(message: Message, storedAttachment: StoredAttachment): Promise<string> {
    try {
      const encodedPath = encodeURIComponent(storedAttachment.path);
      await firstValueFrom(this.api.delete(`/uploads/attachment?path=${encodedPath}`));
      return '';
    } catch (error) {
      console.error('MessageService: deleteStoredAttachment', error);
      return (error as Error).message;
    }
  }

  // ── Suche ─────────────────────────────────────────────────────────────────

  async searchMessages(searchQuery: string, messagesPath: string): Promise<Message[]> {
    try {
      let url = `/search/messages?q=${encodeURIComponent(searchQuery)}`;
      if (messagesPath) {
        // messagesPath z.B. 'channels/{id}/messages/' → extrahiere channelId
        const channelMatch = messagesPath.match(/^channels\/([^/]+)/);
        const chatMatch = messagesPath.match(/^chats\/([^/]+)/);
        if (channelMatch) url += `&channelId=${channelMatch[1]}`;
        if (chatMatch) url += `&chatId=${chatMatch[1]}`;
      }
      const data = await firstValueFrom(this.api.get<any[]>(url));
      return data.map((m) => {
        const collPath = m.channel
          ? `channels/${m.channel.id}/messages/`
          : `chats/${m.chat.id}/messages/`;
        return new Message(m, collPath, m.id);
      });
    } catch (error) {
      console.error('MessageService: searchMessages', error);
      return [];
    }
  }

  // ── Hilfsmethoden ─────────────────────────────────────────────────────────

  /** Leitet aus dem messagePath (z.B. 'channels/x/messages/y') den API-Endpunkt ab */
  private messageToApiPath(message: Message): string {
    // messagePath = collectionPath + id
    // collectionPath Beispiele:
    //   'channels/{chId}/messages/'
    //   'chats/{chatId}/messages/'
    //   'channels/{chId}/messages/{msgId}/answers/'
    const path = message.messagePath; // z.B. 'channels/x/messages/y'
    return '/' + path;
  }
}
