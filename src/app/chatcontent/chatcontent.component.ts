import { Component, inject } from '@angular/core';
import {
  trigger,
  state,
  style,
  animate,
  transition,
} from '@angular/animations';
import { HeaderComponent } from './header/header.component';
import { WorkspacemenuComponent } from './workspacemenu/workspacemenu.component';
import { ChatviewComponent } from './chatview/chatview.component';
import { ThreadviewComponent } from './threadview/threadview.component';
import { CommonModule } from '@angular/common';
import { NavigationService } from '../utils/services/navigation.service';

@Component({
  selector: 'app-chatcontent',
  standalone: true,
  imports: [
    CommonModule,
    HeaderComponent,
    WorkspacemenuComponent,
    ChatviewComponent,
    ThreadviewComponent,
    WorkspacemenuComponent,
  ],
  templateUrl: './chatcontent.component.html',
  styleUrl: './chatcontent.component.scss',
  animations: [
    trigger('slideInOut', [
      state(
        'visible',
        style({
          // fixed value is gonna be replaced by the a dynamically set value due to screenwidth / responsive breakpoint
          width: '20rem',
          opacity: 1,
        })
      ),
      state(
        'hidden',
        style({
          width: '0',
          opacity: 0,
        })
      ),
      transition('visible <=> hidden', [animate('0.125s ease-out')]),
    ]),
  ],
})
export class ChatcontentComponent {
  isWorkspaceMenuVisible = true;

  navigationService = inject(NavigationService);

  toggleWorkspaceMenu() {
    this.isWorkspaceMenuVisible = !this.isWorkspaceMenuVisible;
    const chatContent = document.querySelector('.chatcontent') as HTMLElement;
    const workspaceMenu = document.querySelector(
      '.workspace-menu'
    ) as HTMLElement;

    if (this.isWorkspaceMenuVisible) {
      chatContent.classList.remove('menu-hidden');
      workspaceMenu.style.display = 'block';
      workspaceMenu.classList.remove('hidden');
      workspaceMenu.classList.add('visible');
    } else {
      chatContent.classList.add('menu-hidden');
      workspaceMenu.classList.remove('visible');
      workspaceMenu.classList.add('hidden');
      setTimeout(() => {
        workspaceMenu.style.display = 'none';
      }, 125);
    }
  }
}
