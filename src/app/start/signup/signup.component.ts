import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { UsersService } from '../../utils/services/user.service';
import { AuthService } from '../../utils/services/auth.service';
import { emailValidator, nameValidator, passwordValidator } from '../../utils/form-validators';
import { ChooesavatarComponent } from '../chooesavatar/chooesavatar.component';
import { ChannelService } from '../../utils/services/channel.service';
import { MessageService } from '../../utils/services/message.service';
import { NavigationService } from '../../utils/services/navigation.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [RouterModule, FormsModule, ReactiveFormsModule, ChooesavatarComponent],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.scss',
})
export class SignupComponent {
  private authService = inject(AuthService);
  private userservice = inject(UsersService);
  private channelService = inject(ChannelService);
  private messageService = inject(MessageService);
  private router = inject(Router);
  private navigationService = inject(NavigationService);

  public errorEmailExists = '';
  public loggingIn = false;
  public showChooseAvatarMask = false;

  signupForm = new FormGroup({
    name: new FormControl('', [Validators.required, nameValidator()]),
    email: new FormControl('', [Validators.required, emailValidator()]),
    password: new FormControl('', [Validators.required, passwordValidator()]),
    checkboxPP: new FormControl(false, [Validators.required, Validators.requiredTrue]),
  });

  constructor() {
    const saved = sessionStorage.getItem('signupForm');
    if (saved) this.signupForm.setValue(JSON.parse(saved));
  }

  saveFormDataToSessionStorage(): void {
    sessionStorage.setItem('signupForm', JSON.stringify(this.signupForm.value));
  }

  goBack(): void {
    this.saveFormDataToSessionStorage();
    this.router.navigate(['/']);
  }

  goToPolicy(): void {
    this.navigationService.setPreviousUrl('/signup');
    this.router.navigate(['/policy']);
  }

  async submitSignUpForm(event: Event): Promise<void> {
    event.preventDefault();
    this.clearAllErrorSpans();
    this.loggingIn = true;
    this.signupForm.disable();
    const name = this.signupForm.value.name || '';
    const email = this.signupForm.value.email || '';
    const password = this.signupForm.value.password || '';
    const error = await this.registerNewUser(name, email, password);
    this.loggingIn = false;
    if (error) {
      this.handleSignupErrors(error);
      this.signupForm.enable();
    } else {
      this.signupForm.reset();
      sessionStorage.removeItem('signupForm');
      this.handleSignupSuccess();
    }
  }

  async registerNewUser(name: string, email: string, password: string): Promise<string> {
    try {
      await this.authService.register(name, email, password);
      return '';
    } catch (error: any) {
      console.error('SignupComponent: registerNewUser', error);
      return error?.error?.message || error?.message || 'Registrierung fehlgeschlagen.';
    }
  }

  successChooseAvatar(): void {
    document.getElementById('infoPopover')?.showPopover();
    setTimeout(() => this.router.navigate(['/']), 3000);
  }

  handleSignupSuccess(): void {
    document.getElementById('infoPopover')?.showPopover();
    setTimeout(() => this.router.navigate(['/']), 4000);
  }

  handleSignupErrors(error: string): void {
    if (error.includes('already') || error.includes('email-already-in-use') || error.includes('exists')) {
      this.errorEmailExists = 'Diese E-Mail-Adresse ist bereits vergeben.';
    } else {
      this.errorEmailExists = error;
    }
  }

  clearAllErrorSpans(): void {
    this.errorEmailExists = '';
  }
}
