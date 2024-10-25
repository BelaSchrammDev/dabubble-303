import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, inject, Input, ViewChild } from '@angular/core';
import { MessageAttachment, MessageService } from '../../utils/services/message.service';
import { FormsModule } from '@angular/forms';
import { Channel } from '../../shared/models/channel.class';
import { Chat } from '../../shared/models/chat.class';
import { UsersService } from '../../utils/services/user.service';
import { MessageEditorComponent } from '../message-editor/message-editor.component';
import { Message } from '../../shared/models/message.class';
import { EditedTextLength, isEmptyMessage } from '../../utils/quil/utility';

@Component({
  selector: 'app-message-textarea',
  standalone: true,
  imports: [CommonModule, FormsModule, MessageEditorComponent],
  templateUrl: './message-textarea.component.html',
  styleUrls: ['./message-textarea.component.scss'],
})
export class MessageTextareaComponent {

  @ViewChild('messageeditor', { static: true }) messageeditor!: MessageEditorComponent;

  @Input() set messagesCollectionObject(value: Channel | Chat | Message) {
    this._messagesCollectionObject = value;
    if (this.messageeditor && this.messageeditor.quill) {
      this.resetEditor();
      this.messageeditor.quill.focus();
    }
  }


  private _messagesCollectionObject!: Channel | Chat | Message;
  isHovered = false;
  inputID = Math.random().toString(36).substring(2, 9);
  isActive = false;
  showTextLength = false;
  allowSendMessage = false;
  textLengthInfo = '0/0';

  attachments: MessageAttachment[] = [];
  dropzonehighlighted = false;
  ifMessageUploading = false;
  errorInfo = '';
  errorInfoTimeout: any;


  /**
   * An array of file validation rules used to validate file uploads.
   * Each validator object contains:
   * - `name`: The name of the validation rule.
   * - `validator`: A function that takes a file object and returns a boolean indicating whether the file passes the validation.
   * - `error`: An error message to be displayed if the file does not pass the validation.
   * 
   * Validation rules:
   * - `maxFileSize`: Validates that the file size is less than or equal to 500KB.
   * - `fileType`: Validates that the file type is one of the following: PNG, GIF, JPEG, or PDF.
   */
  private fileValidators = [
    {
      name: 'maxFileSize',
      validator: (file: any) => file.size <= 500000,
      error: 'Die Datei ist zu groß. Maximal 500KB erlaubt.',
    },
    {
      name: 'fileType',
      validator: (file: any) =>
        file.type === 'image/png' ||
        file.type === 'image/gif' ||
        file.type === 'image/jpeg' ||
        file.type === 'application/pdf',
      error: 'Nur Bilder und PDFs erlaubt.',
    },
  ];

  public messageService = inject(MessageService);
  private userservice = inject(UsersService);

  constructor(private el: ElementRef, private _cdr: ChangeDetectorRef) { }

  /**
   * Handles the change in the length of the text in the editor.
   * 
   * @param event - An object containing the edited text length and maximum allowed length.
   * @param event.textLength - The current length of the text in the editor.
   * @param event.maxLength - The maximum allowed length of the text.
   * @param event.messageEmpty - A boolean indicating if the message is empty.
   * 
   * Updates the text length information, determines if the text length warning should be shown,
   * and sets whether sending the message is allowed based on the text length and message emptiness.
   * Triggers change detection to update the view.
   */
  handleEditorTextLengthChanged(event: EditedTextLength) {
    this.textLengthInfo = `${event.textLength}/${event.maxLength}`;
    this.showTextLength = event.textLength > event.maxLength * 0.8;
    this.allowSendMessage = !event.messageEmpty && event.textLength <= event.maxLength;
    this._cdr.detectChanges();
  }


  // -----------------------------------------------------------------------------
  // Eventlistener for drag and drop
  // -----------------------------------------------------------------------------
  @HostListener('dragenter', ['$event'])
  onDragEnter(event: DragEvent) {
    event.preventDefault();
    this.highlightDropZone(true);
  }

  @HostListener('dragover', ['$event'])
  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.highlightDropZone(true);
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(event: DragEvent) {
    event.preventDefault();
    if (this.isLeavingDropZone(event)) this.highlightDropZone(false);
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent) {
    event.preventDefault();
    this.highlightDropZone(false);
    this.loadAttachments(event.dataTransfer);
  }

  private isLeavingDropZone(event: DragEvent): boolean {
    const dropZone = this.el.nativeElement;
    const relatedTarget = event.relatedTarget as Node;
    return !dropZone.contains(relatedTarget);
  }

  private highlightDropZone(highlight: boolean) {
    const nativeElement = this.el.nativeElement;
    this.dropzonehighlighted = highlight;
  }


  /**
   * Asynchronously adds a new message to the collection.
   * 
   * This method first checks if a message is currently being uploaded. If so, it returns early.
   * It then retrieves the message content as HTML and clears any existing error information.
   * If the message content is empty and there are no attachments, it handles the error by displaying
   * a message indicating that the message cannot be empty.
   * 
   * If the current user is verified, it disables the message editor, sets the uploading flag, and
   * attempts to add the new message to the collection. If an error occurs during this process, it
   * handles the error accordingly. Otherwise, it clears the message editor and resets the attachments.
   * 
   * Finally, it re-enables the message editor, resets the uploading flag, and triggers change detection.
   * 
   * @returns {Promise<void>} A promise that resolves when the message has been added or an error has been handled.
   */
  async addNewMessage() {
    if (this.ifMessageUploading || !this.allowSendMessage) return;
    if (!this.userservice.currentUser?.guest && !this.userservice.isUserMemberOfCurrentChannel) {
      this.showErrorWithDelay('Nur Channelmitglieder dürfen Nachrichten senden.');
      return;
    }
    if (await this.userservice.ifCurrentUserVerified()) {
      const newHTMLMessage = this.messageeditor.getMessageAsHTML();
      this.errorInfo = '';
      if (isEmptyMessage(newHTMLMessage) && this.attachments.length === 0) {
        this.showErrorWithDelay('Nachricht darf nicht leer sein.');
      } else {
        this.messageeditor.quill.disable();
        this.ifMessageUploading = true;
        const error = await this.messageService.addNewMessageToCollection(this._messagesCollectionObject, newHTMLMessage, this.attachments);
        if (error) this.showErrorWithDelay(error);
        else this.resetEditor();
        this.ifMessageUploading = false;
        this.messageeditor.quill.enable();
      }
      this._cdr.detectChanges();
    }
  }


  /**
   * Handles errors by setting the error information and clearing it after a timeout.
   *
   * @param error - The error message to be handled.
   */
  private showErrorWithDelay(error: string, delay: number = 8000) {
    if (this.errorInfoTimeout) clearTimeout(this.errorInfoTimeout);
    this.errorInfo = error;
    this._cdr.detectChanges();
    this.errorInfoTimeout = setTimeout(() => {
      this.errorInfo = '';
      this.errorInfoTimeout = null;
    }, delay);
  }


  /**
   * Removes a specified attachment from the list of attachments.
   *
   * @param {MessageAttachment} attachment - The attachment to be removed.
   */
  removeAttachment(attachment: MessageAttachment) {
    this.attachments = this.attachments.filter((a) => a !== attachment);
  }


  /**
   * Handles the change event for the attachment file input.
   * 
   * @param event - The event object from the file input change event.
   */
  changeAttachmentFile(event: any) {
    event.preventDefault();
    this.loadAttachments(event.target);
  }


  /**
   * Loads and validates attachments from the provided file list.
   * 
   * @param fileList - The list of files to be loaded as attachments.
   * 
   * @remarks
   * - The method checks if the total number of files exceeds the allowed limit (5).
   * - It validates each file using the provided validators.
   * - If a file is already attached or fails validation, it is skipped.
   * - Supported file types are images and PDFs.
   * - Errors are accumulated in the `errorInfo` property.
   * 
   * @private
   */
  private loadAttachments(fileList: any) {
    this.errorInfo = '';
    if (fileList.files.length + this.attachments.length > 5) {
      this.showErrorWithDelay('Maximal 5 Dateien erlaubt.');
      return;
    }
    for (let i = 0; i < fileList.files.length; i++) {
      const file = fileList.files[i];
      if (this.fileAllreadyAttached(file)) continue;
      if (!this.fileValidators.every((validator) => validator.validator(file))) {
        this.showErrorWithDelay(file.name + ': ' + (this.fileValidators.find((validator) => !validator.validator(file))?.error as string));
        continue;
      }
      if (file.type.startsWith('image')) {
        this.attachments.push(this.readPicture(file));
      } else if (file.type === 'application/pdf') {
        this.attachments.push(this.readPDF(file));
      }
    }
  }


  /**
   * Checks if a file is already attached by comparing its name, size, and last modified date.
   * 
   * @param file - The file to check for attachment.
   * @returns `true` if the file is already attached, otherwise `false`.
   */
  private fileAllreadyAttached(file: any): boolean {
    return this.attachments.some((a) => a.name === file.name && a.size === file.size && a.lastModified === file.lastModified);
  }


  /**
   * Reads a PDF file and returns a MessageAttachment object containing the file's metadata.
   *
   * @param file - The PDF file to be read.
   * @returns A MessageAttachment object with the file's name, size, last modified date, source icon path, and the file itself.
   */
  private readPDF(file: any): MessageAttachment {
    const reader = new FileReader();
    const attachment: MessageAttachment = {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      src: './assets/icons/chat/write-message/pdf.svg',
      file: file,
    };
    return attachment;
  }


  /**
   * Reads a picture file and returns a `MessageAttachment` object.
   * 
   * This method uses a `FileReader` to read the provided file and sets the `src` property
   * of the `MessageAttachment` object to the data URL of the file once it is loaded.
   * 
   * @param file - The file to be read, typically an image file.
   * @returns A `MessageAttachment` object containing metadata and the data URL of the file.
   */
  private readPicture(file: any): MessageAttachment {
    const reader = new FileReader();
    const attachment: MessageAttachment = {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      src: './assets/icons/chat/write-message/attachment.svg',
      file: file,
    };
    reader.onload = (e) => {
      attachment.src = e.target?.result;
    };
    reader.readAsDataURL(file);
    return attachment;
  }


  /**
   * Resets the message editor by clearing its content, 
   * removing all attachments, and disabling the send message option.
   *
   * @private
   */
  private resetEditor() {
    this.messageeditor.clearEditor();
    this.attachments = [];
    this.allowSendMessage = false;
  }
}
