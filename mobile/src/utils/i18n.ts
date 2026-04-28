import { useLanguageStore, Language } from '../store/languageStore';

type Dict = Record<string, Record<Language, string>>;

const DICT: Dict = {
  // Home
  'home.greeting': { en: 'Hello, {name}', ru: 'Привет, {name}', de: 'Hallo, {name}' },
  'home.where_to_today': { en: 'Where to today?', ru: 'Куда едем?', de: 'Wohin heute?' },
  'home.where_going': { en: 'Where are you going?', ru: 'Куда вы едете?', de: 'Wohin geht es?' },
  'home.pickup': { en: 'Pickup', ru: 'Откуда', de: 'Abholung' },
  'home.destination': { en: 'Destination', ru: 'Куда', de: 'Ziel' },
  'home.use_my_location': { en: 'Use my current location', ru: 'Моё местоположение', de: 'Aktueller Standort' },
  'home.confirm_search': { en: 'Confirm & Search', ru: 'Подтвердить', de: 'Bestätigen' },
  'home.confirm_location': { en: 'CONFIRM LOCATION', ru: 'ПОДТВЕРДИТЬ', de: 'BESTÄTIGEN' },
  'home.request': { en: 'Request', ru: 'Заказать', de: 'Bestellen' },
  'home.schedule': { en: 'Schedule', ru: 'Запланировать', de: 'Planen' },
  'home.searching': { en: 'Searching for drivers nearby', ru: 'Ищем водителей поблизости', de: 'Fahrer wird gesucht' },
  'home.search_hint': { en: 'This usually takes less than a minute', ru: 'Обычно это занимает меньше минуты', de: 'Das dauert meist weniger als eine Minute' },
  'home.cancel': { en: 'Cancel', ru: 'Отмена', de: 'Abbrechen' },
  'home.cancel_trip': { en: 'Cancel trip', ru: 'Отменить поездку', de: 'Fahrt stornieren' },
  'home.driver_on_way': { en: 'Driver is on the way', ru: 'Водитель в пути', de: 'Fahrer ist unterwegs' },
  'home.trip_completed': { en: 'Trip completed!', ru: 'Поездка завершена!', de: 'Fahrt beendet!' },
  'home.rate_driver': { en: 'Rate your driver (optional)', ru: 'Оцените водителя (необязательно)', de: 'Fahrer bewerten (optional)' },
  'home.confirm': { en: 'CONFIRM', ru: 'ПОДТВЕРДИТЬ', de: 'BESTÄTIGEN' },
  'home.on_trip': { en: 'On trip', ru: 'В пути', de: 'Unterwegs' },
  'home.eta': { en: 'ETA', ru: 'ПРИБ.', de: 'ANK.' },
  'home.fare': { en: 'FARE', ru: 'ЦЕНА', de: 'PREIS' },
  'home.call': { en: 'Call', ru: 'Звонок', de: 'Anruf' },
  'home.message': { en: 'Message', ru: 'Чат', de: 'Nachricht' },
  'home.change_dest': { en: 'Change dest', ru: 'Сменить', de: 'Ändern' },
  'home.new_destination': { en: 'New destination', ru: 'Новое место', de: 'Neues Ziel' },

  // Car types
  'car.sedan': { en: 'Sedan', ru: 'Седан', de: 'Limousine' },
  'car.suv': { en: 'SUV', ru: 'Внедорожник', de: 'SUV' },
  'car.van': { en: 'Van', ru: 'Минивэн', de: 'Van' },

  // Chauffeur
  'chauffeur.set_pickup': { en: 'Set pickup location', ru: 'Указать место подачи', de: 'Abholort wählen' },
  'chauffeur.where_pickup': { en: 'Where should we pick you up?', ru: 'Откуда вас забрать?', de: 'Wo sollen wir Sie abholen?' },
  'chauffeur.confirm_pickup': { en: 'Confirm Pickup', ru: 'Подтвердить', de: 'Abholort bestätigen' },
  'chauffeur.request_car': { en: 'Request', ru: 'Заказать', de: 'Bestellen' },
  'chauffeur.schedule_car': { en: 'Schedule', ru: 'Запланировать', de: 'Planen' },
  'chauffeur.select_car': { en: 'Select a car', ru: 'Выберите авто', de: 'Auto wählen' },
  'chauffeur.requesting': { en: 'Requesting…', ru: 'Запрос…', de: 'Anfragen…' },
  'chauffeur.rate_chauffeur': { en: 'Rate your chauffeur', ru: 'Оцените шофёра', de: 'Chauffeur bewerten' },
  'chauffeur.add_tip': { en: 'Add a tip', ru: 'Чаевые', de: 'Trinkgeld' },
  'chauffeur.no_tip': { en: 'No tip', ru: 'Без чаевых', de: 'Kein Trinkgeld' },
  'chauffeur.custom': { en: 'Custom', ru: 'Свои', de: 'Eigene' },
  'chauffeur.start_trip': { en: "I'm in the car · Start trip", ru: 'Я в машине · Начать', de: 'Ich bin drin · Start' },
  'chauffeur.add_destination': { en: '+ Add destination', ru: '+ Добавить остановку', de: '+ Ziel hinzufügen' },
  'chauffeur.continue_new_dest': { en: 'Continue to new destination', ru: 'Дальше к новому месту', de: 'Zum nächsten Ziel' },
  'chauffeur.finish_here': { en: 'Finish ride here', ru: 'Завершить здесь', de: 'Hier beenden' },
  'chauffeur.finish_now': { en: 'Finish ride now', ru: 'Завершить сейчас', de: 'Jetzt beenden' },
  'chauffeur.finding': { en: 'Finding you a driver…', ru: 'Подбираем водителя…', de: 'Fahrer wird gesucht…' },
  'chauffeur.search_address': { en: 'Search address or place', ru: 'Адрес или место', de: 'Adresse oder Ort' },
  'chauffeur.drop_pin': { en: 'Drop a pin on the map', ru: 'Указать точку на карте', de: 'Pin auf der Karte setzen' },
  'chauffeur.drop_pin_sub': { en: 'Pan the map and confirm precise location', ru: 'Сдвиньте карту и подтвердите место', de: 'Karte verschieben und Ort bestätigen' },
  'chauffeur.where_first': { en: 'Where to first?', ru: 'Куда сначала?', de: 'Wohin zuerst?' },
  'chauffeur.next_dest': { en: 'Next destination', ru: 'Следующее место', de: 'Nächstes Ziel' },

  // Settings
  'settings.title': { en: 'Settings', ru: 'Настройки', de: 'Einstellungen' },
  'settings.language': { en: 'Language', ru: 'Язык', de: 'Sprache' },
  'settings.theme': { en: 'Theme', ru: 'Тема', de: 'Design' },

  // Profile
  'profile.title': { en: 'Profile', ru: 'Профиль', de: 'Profil' },
};

export function t(key: string, vars?: Record<string, string>): string {
  const lang = useLanguageStore.getState().language;
  const entry = DICT[key];
  let str = entry?.[lang] ?? entry?.en ?? key;
  if (vars) {
    for (const k in vars) str = str.replace(`{${k}}`, vars[k]);
  }
  return str;
}

// Hook so components re-render on language change
export function useT() {
  const lang = useLanguageStore(s => s.language);
  return (key: string, vars?: Record<string, string>): string => {
    const entry = DICT[key];
    let str = entry?.[lang] ?? entry?.en ?? key;
    if (vars) {
      for (const k in vars) str = str.replace(`{${k}}`, vars[k]);
    }
    return str;
  };
}
