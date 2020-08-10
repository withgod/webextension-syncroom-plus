import store from './store';

import axios from 'axios';
global.browser = require('webextension-polyfill');

setInterval(() => {
  store.dispatch('rooms/fetch').then(() => {
    browser.browserAction.setBadgeText({
      // String型である必要があるので変換
      text: String(store.state.rooms.data.total_published_rooms),
    });
  })
}, 5000);
