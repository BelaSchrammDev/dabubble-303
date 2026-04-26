import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../utils/services/auth.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './verify-email.component.html',
  styleUrl: './verify-email.component.scss',
})
export class VerifyEmailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);

  public state: 'loading' | 'success' | 'error' = 'loading';
  public errorMessage = '';

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state = 'error';
      this.errorMessage = 'Kein Verifikations-Token gefunden.';
      return;
    }
    try {
      await this.authService.verifyEmail(token);
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
