import { BehaviorSubject } from 'rxjs';

function toDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  if (typeof value.toDate === 'function') return value.toDate();
  if (value.seconds !== undefined) return new Date(value.seconds * 1000);
  return new Date();
}

/**
 * Represents the authentication provider type.
 * 
 * Possible values:
 * - 'google': Authentication via Google.
 * - 'email': Authentication via email.
 * - 'guest': Guest authentication.
 */
export type authProvider = 'google' | 'email' | 'guest';

export type CollectionType = 'channel' | 'chat' | 'message';


/**
 * Represents the last read message by a user.
 * 
 * @typedef {Object} LastReadMessage
 * @property {'channel' | 'chat' | 'message'} type - The type of the message.
 * @property {string} objectID - The ID of the object (e.g., channel or chat) the message belongs to.
 * @property {string} messageID - The unique identifier of the message.
 * @property {Date} messageCreateAt - The creation date of the message.
 */
export type LastReadMessage = {
  collectionType: CollectionType;
  collectionID: string;
  messageID: string;
  messageCreateAt: number;
};

export class User {

  private changeUser = new BehaviorSubject<User | null>(null);
  public changeUser$ = this.changeUser.asObservable();

  readonly id: string;
  readonly signupAt: Date;
  readonly provider: authProvider;
  readonly guest: boolean;
  readonly bot: boolean;

  private _lastReadMessages: LastReadMessage[];
  get lastReadMessages(): LastReadMessage[] {
    return this._lastReadMessages;
  }

  private _pictureURL: string | undefined;
  get pictureURL(): string | undefined {
    return this._pictureURL;
  }

  private _name: string;
  get name(): string {
    return this._name;
  }

  private _email: string;
  get email(): string {
    return this._email;
  }

  private _avatar: number;
  get avatar(): number {
    return this._avatar;
  }

  private _online: boolean;
  get online(): boolean {
    return this._online;
  }

  private _chatIDs: string[] = [];
  get chatIDs(): string[] {
    return this._chatIDs;
  }

  private _emailVerified: boolean;
  get emailVerified(): boolean {
    return this._emailVerified;
  }


  constructor(userObj: any, userID: string) {
    this.id = userID;
    this._name = userObj.name ? userObj.name : '';
    this._email = userObj.email ? userObj.email : '';
    this._avatar = userObj.avatar !== undefined ? userObj.avatar : 1;
    this._online = userObj.online ? userObj.online : false;
    this.signupAt = toDate(userObj.signupAt);
    this.setSavePictureURL(userObj.pictureURL);
    this._chatIDs = userObj.chatIDs ? userObj.chatIDs : [];
    this._lastReadMessages = this.parseLRM(userObj.lastReadMessages);
    this._emailVerified = userObj.emailVerified ? userObj.emailVerified : false;
    this.bot = userObj.bot ?? false;
    if (userObj.guest) {
      this.guest = true;
      this.provider = 'guest';
    } else {
      this.guest = false;
      this.provider = userObj.provider ? userObj.provider : 'email';
    }
  }


  /**
   * Sets the user's picture URL if the provided URL is valid and loads successfully.
   * If the URL is invalid or the image fails to load, it sets the user's picture to a default image.
   *
   * @param pictureURL - The URL of the picture to be set. If undefined or an empty string, the default picture is set.
   */
  private setSavePictureURL(pictureURL: string | undefined): void {
    if (pictureURL === undefined) return;
    if (pictureURL === '') { this._pictureURL = undefined; return; }
    const img = new Image();
    img.src = pictureURL;
    img.onload = () => { this._pictureURL = pictureURL; this.changeUser.next(this); };
    img.onerror = () => { this._pictureURL = undefined; this.changeUser.next(this); };
  }


  private parseLRM(raw: any): LastReadMessage[] {
    if (!raw) return [];
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return []; }
    }
    if (Array.isArray(raw)) return raw;
    return [];
  }


  /**
   * Updates the user properties with the provided data.
   * 
   * @param data - An object containing the user properties to update.
   * @param data.name - The new name of the user.
   * @param data.email - The new email of the user.
   * @param data.avatar - The new avatar of the user.
   * @param data.online - The online status of the user.
   * @param data.chatIDs - The new chat IDs associated with the user.
   * @param data.pictureURL - The new picture URL of the user.
   * @param data.emailVerified - The email verification status of the user.
   */
  update(data: any): void {
    if (data.name) this._name = data.name;
    if (data.email) this._email = data.email;
    if (data.avatar !== undefined) this._avatar = data.avatar;
    if (data.online !== undefined) this._online = data.online;
    if (data.chatIDs) this._chatIDs = data.chatIDs;
    if (data.lastReadMessages !== undefined) this._lastReadMessages = this.parseLRM(data.lastReadMessages);
    if (data.emailVerified !== undefined) this._emailVerified = data.emailVerified;
    this.setSavePictureURL(data.pictureURL);
    // If pictureURL is a real URL, changeUser.next fires async from setSavePictureURL (onload/onerror).
    // Otherwise emit immediately.
    if (!data.pictureURL) this.changeUser.next(this);
  }
}
