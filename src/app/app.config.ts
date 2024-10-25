import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getStorage, provideStorage } from '@angular/fire/storage';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideFirebaseApp(() =>
      initializeApp({
        apiKey: "AIzaSyBP1mW7yRMYVouwQqUTWbtdNKdGDkj1btA",
        authDomain: "dabubble-bela-schramm.firebaseapp.com",
        projectId: "dabubble-bela-schramm",
        storageBucket: "dabubble-bela-schramm.appspot.com",
        messagingSenderId: "598525654175",
        appId: "1:598525654175:web:495a472052f2a357a61eaa"
      })
    ),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideStorage(() => getStorage()),
  ],
};
