function toDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  if (typeof value.toDate === 'function') return value.toDate();
  if (value.seconds !== undefined) return new Date(value.seconds * 1000);
  return new Date();
}

export class Channel {
  readonly id: string;

  private _name: string;
  get name(): string { return this._name; }

  private _messagesCount: number;
  get messagesCount(): number { return this._messagesCount; }

  private _description: string;
  get description(): string { return this._description; }

  private _memberIDs: string[];
  get memberIDs(): string[] { return this._memberIDs; }

  readonly createdAt: Date;
  readonly creatorID: string;
  readonly defaultChannel: boolean;

  public unreadMessagesCount = 0;

  get channelMessagesPath(): string {
    return this.id ? `channels/${this.id}/messages/` : '';
  }

  constructor(data: any, channelID: string = '') {
    this.id = channelID;
    this._name = data.name ?? 'New Channel';
    this._description = data.description ?? '';
    this.createdAt = toDate(data.createdAt);
    this.creatorID = data.creatorID ?? '';
    this._memberIDs = data.memberIDs ?? [];
    this.defaultChannel = data.defaultChannel ?? false;
    this._messagesCount = data.messagesCount ?? 0;
  }

  update(data: any): void {
    if (data.name) this._name = data.name;
    if (data.description !== undefined) this._description = data.description;
    if (data.memberIDs) this._memberIDs = data.memberIDs;
    if (data.messagesCount !== undefined) this._messagesCount = data.messagesCount;
    // defaultChannel kann member-Liste für den Willkommens-Channel überschreiben
    if (data.members) this._memberIDs = data.members;
  }
}
