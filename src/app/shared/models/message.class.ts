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

function toDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  if (typeof value.toDate === 'function') return value.toDate();
  if (value.seconds !== undefined) return new Date(value.seconds * 1000);
  return new Date();
}

export class Message {
  private changeMessage = new BehaviorSubject<void>(undefined);
  public changeMessage$ = this.changeMessage.asObservable();

  readonly id: string;
  /** Für Channel-Nachrichten: 'channels/{id}/messages/'
   *  Für Chat-Nachrichten:    'chats/{id}/messages/'
   *  Für Thread-Antworten:    'channels/{chId}/messages/{msgId}/answers/' */
  readonly collectionPath: string;
  readonly creatorID: string;
  readonly createdAt: Date;
  readonly answerable: boolean;

  public unreadMessagesCount: number = 0;
  public propertysUnSet = true;
  public unread: boolean = false;
  public sameUserAsPrevious: boolean = false;
  public newMessageSeparator: boolean = false;
  public newDaySeparator: boolean = false;

  private _content: string;
  get content(): string { return this._content; }

  private _emojies: IReactions[] = [];
  get emojies(): IReactions[] { return this._emojies; }

  private _answerCount: number;
  get answerCount(): number { return this._answerCount; }

  private _lastAnswerAt: Date;
  get lastAnswerAt(): Date { return this._lastAnswerAt; }

  private _editedAt: Date | undefined;
  get editedAt(): Date | undefined { return this._editedAt; }

  private _edited: boolean;
  get edited(): boolean { return this._edited; }

  get messagePath(): string { return this.collectionPath + this.id; }
  get answerPath(): string { return this.messagePath + '/answers/'; }

  private _attachments: StoredAttachment[];
  get attachments(): StoredAttachment[] { return this._attachments; }

  constructor(data: any, collectionPath: string, id: string) {
    this.id = id;
    this.collectionPath = collectionPath;
    this.creatorID = data.creatorID ?? '';
    this.createdAt = toDate(data.createdAt);
    this._content = data.content ?? '';
    this.answerable = data.answerable ?? true;
    this._answerCount = data.answerCount ?? 0;
    this._lastAnswerAt = toDate(data.lastAnswerAt);
    this._edited = data.edited ?? false;
    this._editedAt = data.editedAt ? toDate(data.editedAt) : undefined;
    this._emojies = this.parseReactions(data.emojies);
    this._attachments = this.parseAttachments(data.attachments);
  }

  private parseReactions(raw: any): IReactions[] {
    if (!raw || !Array.isArray(raw)) return [];
    return raw.map((r: any) => {
      if (typeof r === 'string') return JSON.parse(r) as IReactions;
      return r as IReactions;
    });
  }

  private parseAttachments(raw: any): StoredAttachment[] {
    if (!raw) return [];
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return []; }
    }
    if (Array.isArray(raw)) return raw;
    return [];
  }

  calculateReaction(reactionsArray: any[]): void {
    this._emojies = this.parseReactions(reactionsArray);
  }

  update(data: any): void {
    if (data.content !== undefined) this._content = data.content;
    if (data.emojies !== undefined) this._emojies = this.parseReactions(data.emojies);
    if (data.answerCount !== undefined) this._answerCount = data.answerCount;
    if (data.lastAnswerAt !== undefined) this._lastAnswerAt = toDate(data.lastAnswerAt);
    if (data.edited !== undefined) this._edited = data.edited;
    if (data.editedAt !== undefined) this._editedAt = toDate(data.editedAt);
    if (data.attachments !== undefined) this._attachments = this.parseAttachments(data.attachments);
    this.changeMessage.next();
  }
}
