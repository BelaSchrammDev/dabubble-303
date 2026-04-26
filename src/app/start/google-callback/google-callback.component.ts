import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { UsersService } from '../../utils/services/user.service';
import { AuthService } from '../../utils/services/auth.service';
import { SocketService } from '../../utils/services/socket.service';

@Component({
  selector: 'app-google-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;">
      <div class="spinner" style="width:48px;height:48px;border:4px solid #e0e7ff;border-top-color:#428BFF;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
      <p style="color:#666;">Anmeldung wird abgeschlossen…</p>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  `,
})
export class GoogleCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private userservice = inject(UsersService);
  private authService = inject(AuthService);
  private socketService = inject(SocketService);

  async ngOnInit(): Promise<void> {
    // Backend setzt Token als Query-Parameter nach OAuth-Callback
    const accessToken = this.route.snapshot.queryParamMap.get('accessToken');
    const refreshToken = this.route.snapshot.queryParamMap.get('refreshToken');

    if (accessToken && refreshToken) {
      this.authService.saveTokens({ accessToken, refreshToken });
      this.socketService.connect();
      try {
        const userData = await fetch(`${this.getApiUrl()}/auth/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }).then((r) => r.json());
        localStorage.setItem('currentUserId', userData.id);
        await this.userservice.initAfterLogin(userData);
        this.router.navigate(['/chatcontent']);
      } catch {
        this.router.navigate(['/']);
      }
    } else {
      this.router.navigate(['/']);
    }
  }

  private getApiUrl(): string {
    return 'http://localhost:3000/api';
  }
}
