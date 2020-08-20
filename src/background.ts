//@ts-ignore
import store from './store';
import axios from 'axios';

const browser = require('webextension-polyfill');

// アイコンクリック時のアクション
browser.browserAction.onClicked.addListener((): void => {
  browser.tabs.create({
    url: 'https://syncroom.yamaha.com/play/',
    active: true,
  });
});

// stateを復元
store.dispatch('favoriteMembers/restoreFromLocalStorage');
store.dispatch('notificationVacancyRooms/restoreFromLocalStorage');
store.dispatch('notificationOnlineMembers/restoreFromLocalStorage');

// 参考: https://qiita.com/sakuraya/items/33f93e19438d0694a91d
const userAgent: string = window.navigator.userAgent.toLowerCase();
let currentBrowser: string;
if (userAgent.indexOf('msie') !== -1 || userAgent.indexOf('trident') !== -1) {
  currentBrowser = 'InternetExplorer';
} else if (userAgent.indexOf('edge') !== -1) {
  currentBrowser = 'Edge';
} else if (userAgent.indexOf('chrome') !== -1) {
  currentBrowser = 'GoogleChrome';
} else if (userAgent.indexOf('safari') !== -1) {
  currentBrowser = 'Safari';
} else if (userAgent.indexOf('firefox') !== -1) {
  currentBrowser = 'FireFox';
} else if (userAgent.indexOf('opera') !== -1) {
  currentBrowser = 'Opera';
} else {
  currentBrowser = 'unknown';
}

setInterval((): void => {
  // 他のscriptから変更されたものはreactiveにならないので、最初にfetchしておく
  store.dispatch('notificationVacancyRooms/restoreFromLocalStorage');
  store.dispatch('notificationOnlineMembers/restoreFromLocalStorage');

  // 通知登録がある場合のみ実行
  const notificationVacancyRooms = store.getters['notificationVacancyRooms/rooms'];
  const notificationOnlineMembers = store.getters['notificationOnlineMembers/members'];

  if (notificationVacancyRooms.length !== 0 || notificationOnlineMembers.length !== 0) {
    axios.get('https://webapi.syncroom.appservice.yamaha.com/ndroom/room_list.json?pagesize=500&realm=4').then((res) => {
      const rooms: any = res.data.rooms;

      for (let room of rooms) {
        // オンライン通知
        for (let member of room.members) {
          const notificationOnlineMember = notificationOnlineMembers.find((r: any) => r.memberName === member);
          // 最後の部屋作成日時と違う場合は通知
          if (notificationOnlineMember && notificationOnlineMember.lastNotificationRoomCreatedTime !== room.create_time) {
            const options: any = {
              type: 'basic',
              // TODO: iconをわかりやすいものに変える
              iconUrl: 'icons/icon_128.png',
              title: `ルーム名：${room.room_name}`,
              message: `「${notificationOnlineMember.memberName}」さんがオンラインになりました`,
            };

            if (currentBrowser === 'GoogleChrome') {
              // このオプションはGoogleChromeしか対応していないので判定して追加する
              // 参考: https://developer.mozilla.org/ja/docs/Mozilla/Add-ons/WebExtensions/API/notifications/NotificationOptions
              options.requireInteraction = true;
            }
            browser.notifications.create(`online_member::${notificationOnlineMember.memberName}`, options);

            // 更新
            store.dispatch('notificationOnlineMembers/updateNotification', { memberName: notificationOnlineMember.memberName, roomCreateTime: room.create_time });
          }
        }

        // 空き通知
        if (room.num_members < 5) {
          const uid: string = `${room.create_time}||${room.room_name}`;
          const isExistNotificationVacancyRooms: boolean = notificationVacancyRooms.some((r: any) => r.uid === uid);
          if (isExistNotificationVacancyRooms) {
            const options: any = {
              type: 'basic',
              // TODO: iconをわかりやすいものに変える
              iconUrl: 'icons/icon_128.png',
              title: `ルーム名：${room.room_name}`,
              message: '空きがでました',
            };

            if (currentBrowser === 'GoogleChrome') {
              // このオプションはGoogleChromeしか対応していないので判定して追加する
              // 参考: https://developer.mozilla.org/ja/docs/Mozilla/Add-ons/WebExtensions/API/notifications/NotificationOptions
              options.requireInteraction = true;
            }
            browser.notifications.create(`vacancy::${uid}`, options);
          }
        }
      }

      // roomがなくなっていれば通知を削除
      for (let notificationVacancyRoom of notificationVacancyRooms) {
        if (!rooms.some((r: any) => `${r.create_time}||${r.room_name}` === notificationVacancyRoom.uid)) {
          store.dispatch('notificationVacancyRooms/removeNotificationByUID', notificationVacancyRoom.uid);
          // 通知が残っていれば消しておく
          browser.notifications.clear(notificationVacancyRoom.uid);
        }
      }
    });
  }
}, 1000);

const makeJoinUri = (roomName: string, pass: any, pid: number, mode: number): string => {
  let urienc = (str: string | number): string => {
    return encodeURIComponent(str).replace(/[!*'()]/g, (c) => {
      return '%' + c.charCodeAt(0).toString(16);
    });
  };

  let str: string = 'joingroup?mode=' + urienc(mode) + '&pid=' + urienc(pid) + '&nickname=&groupname=' + urienc(roomName) + '&password=' + urienc(pass);
  let uri: string = 'syncroom:';
  let tbl: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let len: number = str.length;
  let mod: number = len % 3;
  if (mod > 0) len -= mod;

  let i, t;
  for (i = 0; i < len; i += 3) {
    t = (str.charCodeAt(i + 0) << 16) | (str.charCodeAt(i + 1) << 8) | str.charCodeAt(i + 2);
    uri += tbl.charAt((t >> 18) & 0x3f);
    uri += tbl.charAt((t >> 12) & 0x3f);
    uri += tbl.charAt((t >> 6) & 0x3f);
    uri += tbl.charAt(t & 0x3f);
  }
  if (mod === 2) {
    t = (str.charCodeAt(i + 0) << 16) | (str.charCodeAt(i + 1) << 8);
    uri += tbl.charAt((t >> 18) & 0x3f);
    uri += tbl.charAt((t >> 12) & 0x3f);
    uri += tbl.charAt((t >> 6) & 0x3f);
    uri += '=';
  } else if (mod === 1) {
    t = str.charCodeAt(i + 0) << 16;
    uri += tbl.charAt((t >> 18) & 0x3f);
    uri += tbl.charAt((t >> 12) & 0x3f);
    uri += '=';
    uri += '=';
  }

  return uri;
};

browser.notifications.onClicked.addListener((notificationId: string): void => {
  const splittedNotificationId: Array<string> = notificationId.split('::');
  const actionType: string = splittedNotificationId[0];

  if (actionType === 'vacancy') {
    const uid: string = splittedNotificationId[1];
    const roomName: string = uid.split('||')[1];
    axios.get('https://webapi.syncroom.appservice.yamaha.com/ndroom/room_list.json?pagesize=500&realm=4').then((res) => {
      const room: any = res.data.rooms.find((room: any) => room.room_name === roomName);

      if (room.need_passwd) {
        const pwPrompt: string = window.prompt('ルームパスワードを入力してください', '');
        if (pwPrompt) {
          browser.tabs.create({
            url: makeJoinUri(roomName, pwPrompt, 4, 2),
            active: true,
          });
        }
      } else {
        browser.tabs.create({
          url: makeJoinUri(roomName, '', 4, 2),
          active: true,
        });
      }
    });

    store.dispatch('notificationVacancyRooms/removeNotificationByUID', uid);
  }

  if (actionType === 'online_member') {
    browser.tabs.create({
      url: 'https://syncroom.yamaha.com/play/',
      active: true,
    });
  }

  browser.notifications.clear(notificationId);
});

browser.notifications.onClosed.addListener((notificationId: string): void => {
  const splittedNotificationId: Array<string> = notificationId.split('::');
  const actionType: string = splittedNotificationId[0];
  const uid: string = splittedNotificationId[1];

  if (actionType === 'vacancy') {
    store.dispatch('notificationVacancyRooms/removeNotificationByUID', uid);
  }

  browser.notifications.clear(notificationId);
});
