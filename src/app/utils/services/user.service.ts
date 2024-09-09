import { inject, Injectable, OnDestroy } from '@angular/core';
import { User } from '../../shared/models/user.class';
import { BehaviorSubject } from 'rxjs';
import { updateDoc, collection, Firestore, onSnapshot, doc, serverTimestamp, getDocs, where, query } from '@angular/fire/firestore';
import { Auth, sendEmailVerification, user } from '@angular/fire/auth';

@Injectable({
  providedIn: 'root',
})
export class UsersService implements OnDestroy {
  private firestore = inject(Firestore);
  private firebaseauth = inject(Auth);
  private unsubUsers: any = null;
  private user$: any = null;
  private currentAuthUser: any = undefined;

  private changeUserListSubject = new BehaviorSubject<string>('');
  public changeUserList$ = this.changeUserListSubject.asObservable();

  private changeCurrentUserSubject = new BehaviorSubject<string>('');
  public changeCurrentUser$ = this.changeCurrentUserSubject.asObservable();

  private selectedUserObjectSubject = new BehaviorSubject<User | undefined>(undefined);
  public selectedUserObject$ = this.selectedUserObjectSubject.asObservable();


  public users: User[] = [];
  private userEmailWaitForLogin: string | undefined;
  public currentUser: User | undefined;
  public currentGuestUserID: string = '';
  public guestUserIDWaitForLogin: string | undefined;


  constructor() {
    this.initUserCollection();
    this.initAuthWatchDog();
    const guestUserEmail = localStorage.getItem('guestuseremail'); // this is only a guest user
    if (guestUserEmail) this.setCurrentUserByEMail(guestUserEmail);
  }


  get currentUserID(): string { return this.currentUser ? this.currentUser.id : 'no user logged in'; }

  getAllUserIDs(): string[] { const userIDs = this.users.map((user) => user.id); return userIDs; }

  getUserByID(id: string): User | undefined { return this.users.find((user) => user.id === id); }

  ifValidUser(userID: string): boolean {
    const user = this.users.find((user) => user.id === userID);
    if (user && (!user.guest || user.id === this.currentGuestUserID)) return true;
    return false;
  }

  async updateCurrentUserDataOnFirestore(userChangeData: {}) {
    try {
      await updateDoc(doc(this.firestore, '/users/' + this.currentUserID), userChangeData);
    } catch (error) {
      console.error('userservice/firestore: ', (error as Error).message);
    }
  }

  // ############################################################################################################
  // Functions for subscribing to Firestore collections
  // ############################################################################################################

  private initUserCollection(): void {
    this.unsubUsers = onSnapshot(
      collection(this.firestore, '/users'),
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') this.users.push(new User(change.doc.data(), change.doc.id));
          if (change.type === 'modified') {
            const user = this.users.find((user) => user.id === change.doc.id);
            if (user) user.update(change.doc.data());
          }
          if (change.type === 'removed') this.users = this.users.filter((user) => user.email !== change.doc.data()['email']);
          if (this.currentUserID === change.doc.id) this.changeCurrentUserSubject.next('userchange');
        });
        this.users.sort((a, b) => a.name.localeCompare(b.name));
        this.changeUserListSubject.next('users');
        if (this.userEmailWaitForLogin) this.setCurrentUserByEMail(this.userEmailWaitForLogin);
      }
    );
  }


  private initAuthWatchDog(): void {
    this.user$ = user(this.firebaseauth).subscribe((user) => {
      if (user) {
        if (user === this.currentAuthUser) return;
        this.currentAuthUser = user;
        const signinProvider = user.providerData[0].providerId;
        console.warn('userservice/auth: Authentication successful: ', user.email, ' provider: ', signinProvider);
        if (!user.emailVerified && signinProvider !== 'google.com') {
          console.warn('userservice/auth: Email not verified');
        }
        if (user.email) this.setCurrentUserByEMail(user.email);
      } else if (this.currentUser) {
        console.warn('userservice: currentUser logout - ' + this.currentUser.email);
        this.setCurrentUserByEMail('');
      }
    });
  }


  public async ifCurrentUserVerified(): Promise<boolean> {
    if (this.currentUser) {
      if (this.currentUser.provider !== 'email') return true;
      if (this.currentUser.emailVerified) return true;
      if (this.currentAuthUser) {
        await this.currentAuthUser.reload();
        console.warn('userservice/auth: Checking email verification');
        if (this.currentAuthUser.emailVerified) {
          await this.updateCurrentUserDataOnFirestore({ emailVerified: true });
          return true;
        } else {
          console.warn('userservice/auth: Email not verified');
          document.getElementById('emailNotVerifiedPopover')?.showPopover();
        }
      }
    }
    return false;
  }


  public async sendEmailVerificationLink(): Promise<void> {
    try {
      const user = this.firebaseauth.currentUser;
      if (user) {
        console.warn('userservice/auth: Sending email verification to: ', user.email);
        await sendEmailVerification(user);
      }
    } catch (error) {
      console.error('userservice/auth: ', (error as Error).message);
    }
  }


  public async setCurrentUserByEMail(userEmail: string): Promise<void> {
    this.userEmailWaitForLogin = undefined;
    if (userEmail !== '') {
      const user = this.users.find((user) => user.email === userEmail);
      if (user) {
        if (this.currentUser && this.currentUser.id === user.id) return;
        this.currentUser = user;
        if (user.guest) this.currentGuestUserID = user.id;
        this.changeCurrentUserSubject.next('userset');
        await updateDoc(doc(this.firestore, '/users/' + this.currentUserID), { online: true, lastLoginAt: serverTimestamp() });
      } else {
        this.userEmailWaitForLogin = userEmail;
      }
    } else {
      const userRef = doc(this.firestore, '/users/' + this.currentUserID);
      if (userRef) await updateDoc(userRef, { online: false });
      this.clearCurrentUser();
    }
  }


  public clearCurrentUser(): void {
    localStorage.removeItem('guestuserid'); // this is only for guest user
    this.currentUser = undefined;
    this.currentGuestUserID = '';
    this.changeCurrentUserSubject.next('userdelete');
  }

  // ############################################################################################################
  // Functions for unsubscribing from Firestore collections
  // ############################################################################################################

  private unsubscribeFromUsers(): void {
    if (this.unsubUsers) {
      this.unsubUsers();
      this.unsubUsers = null;
    }
  }

  private unsubscribeFromAuthUser(): void {
    if (this.user$) {
      this.user$.unsubscribe();
      this.user$ = null;
    }
  }

  updateSelectedUser(user: User | undefined) {
    this.selectedUserObjectSubject.next(user);
  }



  // ############################################################################################################
  // Functions for cleaning up subscriptions
  // ############################################################################################################

  ngOnDestroy(): void {
    this.unsubscribeFromUsers();
    this.unsubscribeFromAuthUser();
  }


}