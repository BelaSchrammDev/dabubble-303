import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../utils/services/auth.service';
import { passwordValidator } from '../../utils/form-validators';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);

  public state: 'form' | 'loading' | 'success' | 'error' = 'form';
  public errorMessage = '';
  private token = '';

  resetForm = new FormGroup({
    password: new FormControl('', [Validators.required, passwordValidator()]),
    passwordConfirm: new FormControl('', [Validators.required]),
  });

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state = 'error';
      this.errorMessage = 'Kein Reset-Token gefunden.';
      return;
    }
    this.token = token;
  }

  get passwordMismatch(): boolean {
    return this.resetForm.value.password !== this.resetForm.value.passwordConfirm;
  }

  async submitReset(event: Event): Promise<void> {
    event.preventDefault();
    if (this.resetForm.invalid || this.passwordMismatch) return;
    this.state = 'loading';
    try {
      await this.authService.resetPassword(this.token, this.resetForm.value.password!);
      this.state = 'success';
      setTimeout(() => this.router.navigate(['/']), 3000);
    } catch (error: any) {
      this.state = 'error';
      this.errorMessage = error?.error?.message || 'Der Link ist ungültig oder abgelaufen.';
    }
  }

  goToLogin(): void {
    this.router.navigate(['/']);
  }
}
