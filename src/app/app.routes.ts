import { Routes } from '@angular/router';
import { ChatcontentComponent } from './chatcontent/chatcontent.component';
import { LoginComponent } from './start/login/login.component';
import { SignupComponent } from './start/signup/signup.component';
import { ImprintComponent } from './start/imprint/imprint.component';
import { PolicyComponent } from './start/policy/policy.component';
import { currentUserExistsGuard } from './utils/guards/current-user-exists.guard';

export const routes: Routes = [
  { path: '', component: LoginComponent },
  { path: 'signup', component: SignupComponent },
  { path: 'imprint', component: ImprintComponent },
  { path: 'policy', component: PolicyComponent },
  {
    path: 'verify-email',
    loadComponent: () => import('./start/verify-email/verify-email.component').then((m) => m.VerifyEmailComponent),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./start/reset-password/reset-password.component').then((m) => m.ResetPasswordComponent),
  },
  {
    path: 'auth/google/callback',
    loadComponent: () => import('./start/google-callback/google-callback.component').then((m) => m.GoogleCallbackComponent),
  },
  {
    path: 'chatcontent',
    component: ChatcontentComponent,
    canActivate: [currentUserExistsGuard],
  },
];
