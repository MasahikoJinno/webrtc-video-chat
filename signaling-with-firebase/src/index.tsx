import * as React from 'react';
import * as ReactDOM from 'react-dom';
import App from './App';
import './index.css';

import * as firebase from 'firebase';
import firebaseConfig from './firebaseConfig';

firebase.initializeApp(firebaseConfig);

ReactDOM.render(
  <App roomName="test-room" />,
  document.getElementById('root') as HTMLElement
);
