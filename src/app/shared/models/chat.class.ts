function toDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  if (typeof value.toDate === 'function') return value.toDate();
  if (value.seconds !== undefined) return new Date(value.seconds * 1000);
  return new Date();
}

export class Chat {
  readonly id: string;
  readonly memberIDs: string[] = [];
  readonly createdAt: Date;
  public messagesCount: number = 0;
  public unreadMessagesCount: number = 0;

  get chatMessagesPath(): string {
    return `chats/${this.id}/messages/`;
  }

  constructor(data: any, id: string) {
    this.id = id;
    this.memberIDs = data.memberIDs ?? [];
    this.messagesCount = data.messagesCount ?? 0;
    this.createdAt = toDate(data.createdAt);
  }

  update(data: any): void {
    if (data.messagesCount !== undefined) this.messagesCount = data.messagesCount;
  }
}
