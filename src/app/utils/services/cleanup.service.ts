import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { UsersService } from './user.service';
import { ChannelService } from './channel.service';
import { NavigationService } from './navigation.service';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class CleanupService {
  private navigationService = inject(NavigationService);
  private userservice = inject(UsersService);
  private channelservice = inject(ChannelService);
  private authService = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);

  /**
   * Meldet den aktuellen User ab.
   * Gast-User werden dabei vollständig vom Server gelöscht.
   */
  async logoutUser(): Promise<void> {
    await this.navigationService.setChatViewObject(this.channelservice.defaultChannel);

    if (this.authService.isGuest()) {
      const guestID = this.userservice.currentUserID;
      await this.userservice.clearCurrentUser();
      await this.deleteGuestUser(guestID);
    } else {
      await this.userservice.clearCurrentUser();
      await this.authService.logout();
    }
    this.router.navigate(['/']);
  }

  /** Löscht den Gast-User komplett vom Backend */
  private async deleteGuestUser(userID: string): Promise<void> {
    try {
      await firstValueFrom(this.api.delete(`/users/${userID}`));
      await this.authService.logout();
    } catch (error) {
      console.error('CleanupService: deleteGuestUser', error);
    }
  }
}
