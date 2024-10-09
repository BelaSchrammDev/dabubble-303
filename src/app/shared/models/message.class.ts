import { Timestamp } from '@angular/fire/firestore';
import { BehaviorSubject } from 'rxjs';

export interface IReactions {
  type: string;
  userIDs: string[];
}

export type StoredAttachment = {
  name: string;
  type: 'image' | 'pdf';
  url: string;
  path: string;
};

export class Message {
  private changeMessage = new BehaviorSubject<void>(undefined);
  public changeMessage$ = this.changeMessage.asObservable();

  readonly id: string;
  readonly collectionPath: string;
  readonly creatorID: string;
  readonly createdAt: Date;
  readonly answerable: boolean;

  public unreadMessagesCount: number = 0;

  private _content: string;
  get content(): string {
    return this._content;
  }

  private _emojies: IReactions[] = [];
  get emojies(): IReactions[] {
    return this._emojies;
  }

  private _answerCount: number;
  get answerCount(): number {
    return this._answerCount;
  }

  private _lastAnswerAt: Date;
  get lastAnswerAt(): Date {
    return this._lastAnswerAt;
  }

  private _editedAt: Date | undefined;
  get editedAt(): Date | undefined {
    return this._editedAt;
  }

  private _edited: boolean;
  get edited(): boolean {
    return this._edited;
  }

  get messagePath(): string {
    return this.collectionPath + this.id;
  }

  get answerPath(): string {
    return this.messagePath + '/answers/';
  }

  private _attachments: StoredAttachment[];
  get attachments(): StoredAttachment[] {
    return this._attachments;
  }

  get searchContext(): string | undefined {
    return this.searchContext;
  }

  set searchContext(value: string | undefined) {
    this.searchContext = value;
  }

  constructor(data: any, collectionPath: string, id: string) {
    this.id = id;
    this.collectionPath = collectionPath;
    this.creatorID = data.creatorID ? data.creatorID : '';
    this.createdAt = data.createdAt ? (data.createdAt as Timestamp).toDate() : new Date();
    if (data.emojies) this.calculateReaction(data.emojies);
    this._content = data.content ? data.content : '';
    this.answerable = data.answerable;
    this._answerCount = data.answerCount ? data.answerCount : 0;
    this._lastAnswerAt = data.lastAnswerAt ? (data.lastAnswerAt as Timestamp).toDate() : new Date();
    this._edited = data.edited ? data.edited : false;
    this._editedAt = data.editedAt ? (data.editedAt as Timestamp).toDate() : undefined;
    this._attachments = this.parseAttachments(data.attachments);
  }

  calculateReaction(reactionsArray: string[]) {
    this._emojies = [];
    if (reactionsArray) {
      reactionsArray.forEach((reaction: string) => {
        this.emojies.push(JSON.parse(reaction));
      });
    }
  }

  parseAttachments(data: any): StoredAttachment[] {
    if (data !== undefined && data !== '') return JSON.parse(data);
    return [];
  }

  update(data: any): void {
    if (data.content) this._content = data.content;
    if (data.emojies) this.calculateReaction(data.emojies);
    if (data.answerCount) this._answerCount = data.answerCount;
    if (data.lastAnswerAt) this._lastAnswerAt = (data.lastAnswerAt as Timestamp).toDate();
    if (data.edited !== undefined) this._edited = data.edited;
    if (data.editedAt) this._editedAt = (data.editedAt as Timestamp).toDate();
    if (data.attachments) this._attachments = this.parseAttachments(data.attachments);
    this.changeMessage.next();
  }
}
