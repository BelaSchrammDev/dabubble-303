import {
  ChangeDetectorRef,
  Component,
  inject,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { UsersService } from '../../../utils/services/user.service';
import { User } from '../../../shared/models/user.class';

import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import {
  nameValidator,
  emailValidator,
  passwordValidator,
} from '../../../utils/form-validators';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AvatarDirective } from '../../../utils/directives/avatar.directive';
import { CleanupService } from '../../../utils/services/cleanup.service';
import { ChooesavatarComponent } from '../../../start/chooesavatar/chooesavatar.component';
import { ApiService } from '../../../utils/services/api.service';
import { firstValueFrom } from 'rxjs';
import { NavigationService } from '../../../utils/services/navigation.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ChooesavatarComponent,
    FormsModule,
    AvatarDirective,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit {
  private subProfileTarget: any = null;

  showProfileDetails = false;
  editMode = false;
  showChooseAvatarForm = false;
  isGoogleOrGuestAccount: boolean = false;
  isGuestAccount: boolean = false;
  isGoogleAccount: boolean = false;
  reauthpassword = '';
  reauthpasswordinfo = '';
  profileForm: FormGroup;
  onlineStatus: string = 'offline';
  onlineColor: string = '#92c83e';
  offlineColor: string = '#686868';

  /**
   * Constructs a `ProfileComponent` instance.
   *
   * @param userservice - The `UsersService` instance for managing user data.
   * @param navigationService - The `NavigationService` instance for managing navigation.
   * @param cleanupservice - The `CleanupService` instance for cleanup tasks.
   * @param fb - The `FormBuilder` instance for creating form groups.
   * @param router - The `Router` instance for navigation.
   * @param cdRef - The `ChangeDetectorRef` instance for manual change detection.
   */
  private api = inject(ApiService);

  constructor(
    public userservice: UsersService,
    public navigationService: NavigationService,
    private cleanupservice: CleanupService,
    private fb: FormBuilder,
    private router: Router,
    private cdRef: ChangeDetectorRef
  ) {
    this.profileForm = this.fb.group({
      name: ['', [Validators.required, nameValidator()]],
      email: ['', [Validators.required, emailValidator()]],
    });
    this.userservice.currentUser?.changeUser$.subscribe((user) => {
      this.onlineStatus = user?.online ? 'online' : 'offline';
    });
    this.checkCanEmailChange();
  }

  /**
   * Initializes the `ProfileComponent` by:
   * - Populating the `profileForm` with the current user's name and email.
   * - Checking if the user can change their email.
   * - Resetting the `reauthpasswordinfo` property.
   * - Subscribing to the `showProfileDetails$` observable from the `NavigationService` to update the `showProfileDetails` property and trigger manual change detection.
   */
  ngOnInit() {
    if (this.userservice.currentUser) {
      this.profileForm.patchValue({
        name: this.userservice.currentUser.name,
        email: this.userservice.currentUser.email,
      });
    }
    this.checkCanEmailChange();
    this.reauthpasswordInfoReset();
    this.subProfileTarget =
      this.navigationService.showProfileDetails$.subscribe((show) => {
        this.showProfileDetails = show;
        this.cdRef.detectChanges(); // Manuelle Änderungserkennung nach Aktualisierung
      });
  }

  /**
   * Unsubscribes from the `showProfileDetails$` observable subscription when the component is destroyed.
   */
  ngOnDestroy() {
    this.subProfileTarget.unsubscribe();
  }

  /**
   * Checks if the current user's account is a Google or guest account.
   * This information is used to determine if the user can change their email address.
   */
  private checkCanEmailChange() {
    this.isGoogleAccount = this.userservice.currentUser?.provider === 'google';
    this.isGuestAccount = this.userservice.currentUser?.provider === 'guest';
  }

  /**
   * Checks if the current user's email address has changed compared to the email address stored in the `currentUser` property of the `UserService`.
   * This method returns `true` if the user is not a Google or guest account, and the email address in the `profileForm` is different from the email address of the current user.
   * @returns {boolean} `true` if the email address has changed, `false` otherwise.
   */
  emailChanged(): boolean {
    return (
      !this.isGoogleAccount &&
      !this.isGuestAccount &&
      this.profileForm.get('email')?.value !==
        this.userservice.currentUser?.email
    );
  }

  /**
   * Checks if the current user's name has changed compared to the name stored in the `currentUser` property of the `UserService`.
   * This method returns `true` if the name in the `profileForm` is different from the name of the current user.
   * @returns {boolean} `true` if the name has changed, `false` otherwise.
   */
  nameChanged(): boolean {
    return (
      this.profileForm.get('name')?.value !== this.userservice.currentUser?.name
    );
  }

  /**
   * Checks if the current user's password is valid.
   * If the email has not changed, this method always returns `true`.
   * Otherwise, it checks if the `reauthpassword` property is at least 8 characters long.
   * @returns {boolean} `true` if the password is valid, `false` otherwise.
   */
  passwordCheck(): boolean {
    if (!this.emailChanged()) return true;
    return this.reauthpassword.length >= 8;
  }

  /**
   * Resets the `reauthpasswordinfo` property to the default value of "Mit aktuellem Password bestätigen!".
   * This method is likely used to clear any error or informational messages related to the user's re-authentication password.
   */
  reauthpasswordInfoReset() {
    this.reauthpasswordinfo = 'Mit aktuellem Password bestätigen!';
  }

  /**
   * Determines whether the submit button should be disabled based on the validity of the password and whether the email or name has changed.
   * @returns {boolean} `true` if the submit button should be disabled, `false` otherwise.
   */
  submitButtonDisable(): boolean {
    return (
      !this.passwordCheck() || (!this.emailChanged() && !this.nameChanged())
    );
  }

  /**
   * Resets the state of various UI elements related to the user's profile.
   * This method sets the `showProfileDetails`, `editMode`, and `showChooseAvatarForm` properties to `false`,
   * and calls the `setProfileTarget` method of the `navigationService` to indicate that the profile target is no longer active.
   * This method is likely used to clean up the UI state when the user navigates away from the profile section.
   */
  resetPopoverState() {
    this.showProfileDetails = false;
    this.editMode = false;
    this.showChooseAvatarForm = false;
    this.navigationService.setProfileTarget(false);
  }

  /**
   * Shows the choose avatar form by setting the `showChooseAvatarForm` property to `true`.
   * This method is likely used to toggle the visibility of a component or modal that allows the user to select a new avatar image.
   */
  showChooseAvatarComponent() {
    this.showChooseAvatarForm = true;
  }

  /**
   * Hides the choose avatar form by setting the `showChooseAvatarForm` property to `false`.
   * This method is likely used to close a component or modal that allows the user to select a new avatar image.
   */
  closeChooseAvatarComponent() {
    this.showChooseAvatarForm = false;
  }

  /**
   * Toggles the visibility of the profile details section.
   * When called, this method will flip the value of the `showProfileDetails` property,
   * which is likely used to control the display of a profile details component or section.
   */
  toggleProfileDetails() {
    this.showProfileDetails = !this.showProfileDetails;
  }

  /**
   * Toggles the edit mode for the user's profile.
   * When edit mode is enabled, the profile form is populated with the user's current name and email.
   * If the user is a guest account, the name field is set to 'Gast' and the email field is set to 'gast@da-bubble.de'.
   * If the user is not a guest account, the name field is set to the user's current name and the email field is set to the user's current email.
   * The name field is set to required if the user is a guest account, or required and validated with a custom name validator if the user is not a guest account.
   * The `reauthpassword` property is reset to an empty string when edit mode is enabled.
   */
  toggleEditMode() {
    this.editMode = !this.editMode;
    if (this.editMode && this.userservice.currentUser) {
      const isGuestAccount = this.userservice.currentUser.provider === 'guest';
      this.profileForm.patchValue({
        name: isGuestAccount ? 'Gast' : this.userservice.currentUser.name,
        email: isGuestAccount
          ? 'gast@da-bubble.de'
          : this.userservice.currentUser.email,
      });

      if (isGuestAccount) {
        this.profileForm.get('name')?.setValidators(Validators.required);
      } else {
        this.profileForm
          .get('name')
          ?.setValidators([Validators.required, nameValidator()]);
      }

      this.profileForm.get('name')?.updateValueAndValidity();
      this.reauthpassword = '';
    }
  }

  /**
   * Saves any changes made to the user's profile, including updating the user's name and email.
   * If the user's name has changed, it updates the user's name in Firestore.
   * If the user's email has changed, it updates the user's email and sends a new email verification link.
   * If there are any errors updating the email, it calls the `handleEmailChangeErrors` method to handle the error.
   * If the save is successful, it toggles the edit mode off.
   */
  async saveChanges() {
    let saveChangesSuccess = true;
    if (this.nameChanged()) {
      await this.userservice.updateCurrentUserDataOnFirestore({
        name: this.profileForm.get('name')?.value,
      });
    }
    if (this.emailChanged()) {
      const error = await this.updateCurrentUserEmail(
        this.profileForm.get('email')?.value,
        this.reauthpassword
      );
      if (error) {
        this.handleEmailChangeErrors(error);
        saveChangesSuccess = false;
      }
    }
    if (saveChangesSuccess) this.toggleEditMode();
  }

  /**
   * Handles errors that occur when updating the user's email.
   * If the error indicates that the user provided the wrong password, it sets a message to display to the user.
   * @param error - The error message that occurred during the email update.
   */
  handleEmailChangeErrors(error: string) {
    if (error.includes('auth/wrong-password')) {
      this.reauthpasswordinfo = 'Falsches Passwort';
    }
  }

  /**
   * Logs out the current user and navigates to the home page.
   */
  async logoutUser() {
    await this.cleanupservice.logoutUser();
  }

  /**
   * Updates the current user's email address.
   *
   * This method first re-authenticates the user with their current password, then updates the user's email address in Firebase Authentication and Firestore. It also sends a new email verification link to the user.
   *
   * @param newEmail - The new email address to set for the current user.
   * @param currentPassword - The current password of the user, used for re-authentication.
   * @returns An empty string if the update is successful, or an error message if there is a problem.
   */
  async updateCurrentUserEmail(newEmail: string, _currentPassword: string): Promise<string> {
    try {
      if (!this.userservice.currentUser) return 'Kein Benutzer angemeldet.';
      await this.userservice.updateCurrentUserDataOnFirestore({ email: newEmail, emailVerified: false });
      await this.userservice.sendEmailVerificationLink();
      return '';
    } catch (error) {
      return (error as Error).message;
    }
  }
}
