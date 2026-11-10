import './ui/style.css';
import { App } from './ui/app';

const app = new App();
// Accès de débogage et de test depuis la console du navigateur.
(window as unknown as { rosace: App }).rosace = app;
