import { Component, EventEmitter, inject, Output } from '@angular/core';
import { UsersService } from '../../utils/services/user.service';
import { RouterLink, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../utils/services/api.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-chooseavatar',
  standalone: true,
  imports: [
    RouterLink,
    RouterModule,
    CommonModule
  ],
  templateUrl: './chooesavatar.component.html',
  styleUrl: './chooesavatar.component.scss'
})
export class ChooesavatarComponent {

  @Output() clickSuccess = new EventEmitter<void>();

  public userservice = inject(UsersService);
  private api = inject(ApiService);
  private defaultAvatarPath: string = './assets/icons/start/profile-big.svg';
  private avatarPath: string = './assets/icons/start/choose-avatar/';

  public selectedAvatarPicture: any;
  private selectedAvatarNumber: number = 0;
  public pictureFile: any;
  public picturePropertysError: string = '';
  public uploading: boolean = false;
  public changedAvatar: boolean = false;

  avatarList = [
    { id: 0, img_name: this.defaultAvatarPath },
    { id: 1, img_name: this.avatarPath + 'choose-avatar-1.svg' },
    { id: 2, img_name: this.avatarPath + 'choose-avatar-2.svg' },
    { id: 3, img_name: this.avatarPath + 'choose-avatar-3.svg' },
    { id: 4, img_name: this.avatarPath + 'choose-avatar-4.svg' },
    { id: 5, img_name: this.avatarPath + 'choose-avatar-5.svg' },
    { id: 6, img_name: this.avatarPath + 'choose-avatar-6.svg' },
  ]

  constructor() {
    this.undoAvatarChange();
  }


  /**
   * Reverts any changes made to the user's avatar.
   * 
   * This method resets the `changedAvatar` flag to `false`, clears the `pictureFile` and 
   * `picturePropertysError`, and restores the `selectedAvatarPicture` to the user's current 
   * avatar picture. If the user has a custom picture URL, it will be used. Otherwise, the 
   * avatar will be set based on the user's avatar number from the `avatarList`.
   */
  undoAvatarChange() {
    this.changedAvatar = false;
    this.pictureFile = null;
    this.picturePropertysError = '';
    if (this.userservice.currentUser?.pictureURL) {
      this.selectedAvatarPicture = this.userservice.currentUser?.pictureURL;
    } else {
      const avatarNumber = this.userservice.currentUser?.avatar || 0;
      this.selectedAvatarPicture = this.avatarList[avatarNumber].img_name;
    }
  }


  /**
   * Sets the avatar for the current user.
   * 
   * @param avatar - The number representing the avatar to be set.
   * 
   * This method performs the following actions:
   * - If the current user's picture URL is not set and the current avatar is the same as the provided avatar, it returns early.
   * - Clears any existing picture property errors.
   * - Resets the picture file to null.
   * - Marks that the avatar has been changed.
   * - Updates the selected avatar number.
   * - Updates the selected avatar picture based on the provided avatar number.
   */
  setAvatar(avatar: number) {
    if (!this.userservice.currentUser?.pictureURL && this.userservice.currentUser?.avatar === avatar) return;
    this.picturePropertysError = '';
    this.pictureFile = null;
    this.changedAvatar = true;
    this.selectedAvatarNumber = avatar;
    this.selectedAvatarPicture = this.avatarList[avatar].img_name;
  }


  /**
   * Asynchronously sets the avatar picture URL to Firestore.
   * 
   * This method uploads a user-provided picture file to Firestore and updates the user's avatar picture URL.
   * It handles the upload process, including setting the uploading state and managing any errors that occur.
   * 
   * @param pictureFile - The picture file to be uploaded.
   * @returns A promise that resolves when the upload process is complete.
   */
  async setAvatarPictureURLtoFirestore(pictureFile: any): Promise<void> {
    this.uploading = true;
    const error = await this.uploadProfilePicture(this.userservice.currentUserID, pictureFile);
    if (error) this.handleUploadErrors(error);
    this.uploading = false;
  }

  async uploadProfilePicture(userID: string, file: any): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', file, file.name);
      const response = await firstValueFrom(
        this.api.postFormData<{ pictureURL: string }>(`/uploads/profile-picture`, formData)
      );
      await this.userservice.updateCurrentUserDataOnFirestore({ pictureURL: response.pictureURL, avatar: 0 });
      return '';
    } catch (error) {
      console.error('chooesavatar: uploadProfilePicture', error);
      return (error as Error).message;
    }
  }


  /**
   * Handles the file input change event to load and display an image.
   * 
   * This method is triggered when a file is selected through an input element.
   * It validates the selected file, reads it as a data URL, and sets it as the 
   * source for an image preview.
   * 
   * @param event - The file input change event containing the selected file.
   */
  public loadFileToViewInImg(event: any) {
    if (event.target.files && event.target.files[0]) {
      this.picturePropertysError = '';
      const file = event.target.files[0];
      if (!this.validateFilePropertys(file)) return;
      this.changedAvatar = true;
      const reader = new FileReader();
      reader.onload = (e: any) => { this.selectedAvatarPicture = e.target.result; };
      reader.readAsDataURL(file);
      this.pictureFile = file;
    }
  }


  /**
   * Validates the properties of a given file.
   * 
   * @param file - The file to be validated.
   * @returns `true` if the file meets the size and type requirements, otherwise `false`.
   * 
   * The file must meet the following criteria:
   * - Size must not exceed 500 KB.
   * - Type must be one of the following: 'image/jpeg', 'image/png', 'image/gif'.
   * 
   * If the file does not meet these criteria, an appropriate error message is set in `picturePropertysError`.
   */
  private validateFilePropertys(file: any): boolean {
    if (file.size > 500000) {
      this.picturePropertysError = 'Datei ist zu groß (max. 500 KB)';
      return false;
    }
    if (file.type !== 'image/jpeg' && file.type !== 'image/png' && file.type !== 'image/gif') {
      this.picturePropertysError = 'Bitte nur PNG, JPEG oder GIF';
      return false;
    }
    return true;
  }


  /**
   * Handles errors that occur during file upload.
   * Logs the error to the console.
   *
   * @param error - The error object containing details about the upload failure.
   */
  private handleUploadErrors(error: any) {
    console.error('Error uploading file: ', error);
  }


  /**
   * Handles the submission of the chosen avatar.
   * 
   * This method is triggered by an event and performs the following actions:
   * - Prevents the default form submission behavior.
   * - Checks if the avatar has been changed.
   * - If a picture file is present, uploads it to Firestore.
   * - If no picture file is present, updates the user's avatar data on Firestore with the selected avatar number and an empty picture URL.
   * - Emits a success event upon successful completion.
   * 
   * @param {Event} event - The event that triggered the submission.
   * @returns {Promise<void>} - A promise that resolves when the submission process is complete.
   * @throws Will log an error message if the submission process fails.
   */
  async submitChooseAvatar(event: Event) {
    try {
      event.preventDefault();
      if (this.changedAvatar) {
        if (this.pictureFile) await this.setAvatarPictureURLtoFirestore(this.pictureFile);
        else await this.userservice.updateCurrentUserDataOnFirestore({ avatar: this.selectedAvatarNumber, pictureURL: '' });
      }
      this.clickSuccess.emit();
    } catch (error) {
      console.error('Error submitting choose avatar:', error);
    }
  }

}
