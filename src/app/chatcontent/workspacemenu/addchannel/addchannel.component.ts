import {
  Component,
  inject,
  AfterViewInit,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { ChannelService } from '../../../utils/services/channel.service';
import { UsersService } from '../../../utils/services/user.service';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AvatarDirective } from '../../../utils/directives/avatar.directive';
import { User } from '../../../shared/models/user.class';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  BreakpointObserver,
  Breakpoints,
} from '@angular/cdk/layout';

@Component({
  selector: 'app-addchannel',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    AvatarDirective,
  ],
  templateUrl: './addchannel.component.html',
  styleUrl: './addchannel.component.scss',
})
export class AddchannelComponent implements AfterViewInit, OnInit, OnDestroy {
  addChannelId: HTMLElement | null = null;
  toggleAddChannelPopover = true;
  isUserSearchSelected = true;
  isAnyOptionSelected = false;
  searchQuery: string = '';
  selectedUsers: User[] = [];
  isFullscreen = false;
  private breakpointSubscription: Subscription = new Subscription();

  public channelservice = inject(ChannelService);
  public userservice = inject(UsersService);
  public name: string = '';
  public description: string = '';

  constructor(private breakpointObserver: BreakpointObserver) {}

  ngOnInit(): void {
    this.breakpointSubscription = this.breakpointObserver
      .observe([Breakpoints.Small, Breakpoints.XSmall])
      .subscribe((result) => {
        this.isFullscreen = result.matches;
      });
  }

  ngOnDestroy(): void {
    this.breakpointSubscription.unsubscribe();
  }

  get filteredUsers(): User[] {
    const query = this.searchQuery.toLowerCase();
    return this.userservice.users.filter(
      (u) =>
        !u.guest &&
        u.id !== this.userservice.currentUserID &&
        !this.selectedUsers.some((s) => s.id === u.id) &&
        (!query || u.name.toLowerCase().includes(query)),
    );
  }

  get userAmount(): number {
    return this.selectedUsers.length;
  }

  addOptionSelected(isUserSearchSelected: boolean) {
    this.isUserSearchSelected = isUserSearchSelected;
    this.isAnyOptionSelected = true;
  }

  addUserToSelection(user: User) {
    if (!this.selectedUsers.some((u) => u.id === user.id)) {
      this.selectedUsers.push(user);
    }
    this.searchQuery = '';
  }

  removeUserFromSelection(user: User) {
    this.selectedUsers = this.selectedUsers.filter((u) => u.id !== user.id);
  }

  ngAfterViewInit() {
    this.addChannelId = document.getElementById('addChannelId');
    this.closeOnClick();
  }

  closeOnClick() {
    document.getElementById('addChannelId')?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target === this.addChannelId) {
        this.addChannelId?.hidePopover();
      }
    });
  }

  toggleAddChannel() {
    if (!this.toggleAddChannelPopover) {
      this.addChannelId?.hidePopover();
    }
    this.toggleAddChannelPopover = !this.toggleAddChannelPopover;
  }

  resetAddChannel() {
    this.name = '';
    this.description = '';
    this.isUserSearchSelected = false;
    this.selectedUsers = [];
    this.searchQuery = '';
    this.isAnyOptionSelected = false;
  }

  addNewChannel() {
    const currentUserID = this.userservice.currentUserID;
    let memberIDs: string[];
    if (this.isUserSearchSelected) {
      memberIDs = this.selectedUsers.map((u) => u.id);
    } else {
      memberIDs = this.userservice.getAllUserIDs().filter((id) => id !== currentUserID);
    }
    memberIDs.push(currentUserID);
    this.channelservice.addNewChannelToFirestore(this.name, this.description, memberIDs);
  }
}
