import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormControl, FormGroup, FormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { UsersService } from '../../utils/services/user.service';
import { AuthService } from '../../utils/services/auth.service';
import { ChannelService } from '../../utils/services/channel.service';
import { MessageService } from '../../utils/services/message.service';
import { emailValidator, passwordValidator } from '../../utils/form-validators';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./intro-animation.scss', './login.component.scss'],
})
export class LoginComponent implements OnInit, OnDestroy {
  private readonly loginInfoStayTime = 2000;
  private showLoginInfoTime: number | null = null;

  public userservice = inject(UsersService);
  private authService = inject(AuthService);
  private channelService = inject(ChannelService);
  private messageService = inject(MessageService);
  private router = inject(Router);

  private subCurrentUser: Subscription | null = null;

  public errorEmail = '';
  public errorPassword = '';
  public errorGoogleSignin = '';
  public loginInfoMessage = '?';
  public loginInfoIcon = false;
  public showSpinner = false;
  public spinnerMobile = false;
  public showInfoModal = false;
  public passwordResetFormShow = false;
  public loginFormShow = true;
  public showIntro = true;
  private sessionWithIntro = true;

  passwordResetForm = new FormGroup({
    email: new FormControl('', [Validators.required, emailValidator()]),
  });

  loginForm = new FormGroup({
    email: new FormControl('', [Validators.required, emailValidator()]),
    password: new FormControl('', [Validators.required, passwordValidator()]),
  });

  ngOnInit(): void {
    this.checkIntroStatus();
    this.checkScreenWidth();
    window.addEventListener('resize', this.checkScreenWidth.bind(this));
    this.initCurrentUserWatch();
  }

  ngOnDestroy(): void {
    this.subCurrentUser?.unsubscribe();
    window.removeEventListener('resize', this.checkScreenWidth.bind(this));
  }

  private checkIntroStatus(): void {
    const played = sessionStorage.getItem('introPlayed');
    if (played) {
      this.showIntro = false;
      this.sessionWithIntro = false;
    } else {
      sessionStorage.setItem('introPlayed', 'true');
    }
  }

  private checkScreenWidth(): void {
    this.spinnerMobile = window.innerWidth <= 480;
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  async submitLoginForm(event: Event): Promise<void> {
    event.preventDefault();
    this.clearAllErrorSpans();
    const email = this.loginForm.value.email || '';
    const password = this.loginForm.value.password || '';
    this.loginForm.disable();
    this.showSpinner = true;
    await this.loginUser(email, password);
    this.showSpinner = false;
    this.loginForm.enable();
  }

  async loginUser(email: string, password: string): Promise<void> {
    try {
      const response = await this.authService.login(email, password);
      await this.userservice.initAfterLogin(response.user);
      this.handleLoginSuccess();
    } catch (error: any) {
      this.handleLoginErrors(error?.error?.message || error?.message || 'unknown');
    }
  }

  // ── Google OAuth ───────────────────────────────────────────────────────────

  async signinWithGoogle(): Promise<void> {
    this.authService.loginWithGoogle();
    // Browser wird zu Backend-Google-OAuth weitergeleitet
    // Callback landet auf /auth/google/callback → GoogleCallbackComponent
  }

  // ── Gast-Login ─────────────────────────────────────────────────────────────

  async loginGuest(): Promise<void> {
    this.showSpinner = true;
    this.loginForm.disable();
    this.clearAllErrorSpans();
    try {
      const response = await this.authService.loginAsGuest();
      await this.userservice.initAfterLogin(response.user);
      this.handleLoginSuccess();
      setTimeout(() => this.implementNewUserStuff(response.user.id, true), 4000);
    } catch (error) {
      console.error('LoginComponent: loginGuest', error);
    }
    this.showSpinner = false;
    this.loginForm.enable();
  }

  // ── Passwort-Reset ─────────────────────────────────────────────────────────

  async submitPasswordResetForm(event: Event): Promise<void> {
    event.preventDefault();
    this.passwordResetForm.disable();
    this.clearAllErrorSpans();
    this.showSpinner = true;
    const email = this.passwordResetForm.value.email || '';
    try {
      await this.authService.forgotPassword(email);
      this.showInfoMessage('EMail gesendet', true);
      this.passwordResetForm.reset();
      document.getElementById('infoPopover')?.showPopover();
      setTimeout(() => {
        document.getElementById('infoPopover')?.hidePopover();
        this.passwordResetFormShow = false;
      }, 3000);
    } catch (error: any) {
      this.errorEmail = 'Diese E-Mail-Adresse ist leider unbekannt.';
    }
    this.showSpinner = false;
    this.passwordResetForm.enable();
  }

  // ── Navigation nach Login ──────────────────────────────────────────────────

  initCurrentUserWatch(): void {
    this.subCurrentUser = this.userservice.changeCurrentUser$.subscribe((changeType) => {
      if (changeType === 'login') {
        this.loginFormShow = false;
        setTimeout(() => {
          const userName = this.userservice.currentUser?.guest
            ? 'Gast'
            : this.userservice.currentUser?.name;
          this.showInfoMessage('Anmelden als ' + userName, false);
          if (this.showLoginInfoTime === null) this.showLoginInfoTime = Date.now();
          const elapsed = Date.now() - this.showLoginInfoTime;
          if (elapsed < this.loginInfoStayTime) {
            setTimeout(() => this.redirectToChatContent(), this.loginInfoStayTime - elapsed);
          } else {
            this.redirectToChatContent();
          }
        }, this.sessionWithIntro ? 2000 : 0);
      }
    });
  }

  handleLoginSuccess(): void {
    this.showLoginInfoTime = Date.now();
  }

  handleLoginErrors(error: string): void {
    if (
      error.includes('Unauthorized') || error.includes('Invalid') || error.includes('credentials') ||
      error.includes('Ungültige') || error.includes('ungültige') || error.includes('Anmeldedaten')
    ) {
      this.errorEmail = 'E-Mail oder Passwort falsch.';
    } else if (error.includes('not found') || error.includes('user-not-found') || error.includes('nicht gefunden')) {
      this.errorEmail = 'Diese Mailaddresse ist nicht registriert.';
    } else if (error.includes('wrong-password') || error.includes('Falsches Passwort')) {
      this.errorPassword = 'Falsches Passwort.';
    } else {
      this.errorEmail = 'E-Mail oder Passwort falsch.';
    }
  }

  redirectToChatContent(): void {
    this.showInfoMessage('', false);
    this.router.navigate(['/chatcontent']);
  }

  showInfoMessage(message: string, showImg: boolean): void {
    if (!message) {
      this.loginInfoIcon = false;
      document.getElementById('infoPopover')?.hidePopover();
    } else {
      this.loginInfoIcon = showImg;
      this.loginInfoMessage = message;
      document.getElementById('infoPopover')?.showPopover();
    }
  }

  clearAllErrorSpans(): void {
    this.errorEmail = '';
    this.errorPassword = '';
    this.errorGoogleSignin = '';
  }

  // ── Neuer-User-Setup ───────────────────────────────────────────────────────

  private async implementNewUserStuff(newUserID: string, isGuest: boolean): Promise<void> {
    await this.channelService.addChatWithUserOnFirestore(newUserID);
    const botMessages = isGuest
      ? ['Willkommen als Gast! Du kannst alle Funktionen ausprobieren.']
      : ['Willkommen bei DABubble! Schön, dass du dabei bist.'];
    const botChatId = await this.channelService.addChatWithUserOnFirestore('00000000-0000-0000-0000-000000000001');
    if (botChatId) {
      const botChat = this.channelService.getChatByID(botChatId);
      if (botChat) {
        for (const msg of botMessages) {
          await this.messageService.addNewMessageToCollection(botChat, msg, [], '00000000-0000-0000-0000-000000000001');
        }
      }
    }
  }
}
