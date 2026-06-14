// ─── tutorialData.ts — 8-chapter interactive tutorial ──────────────────────────

export type StepType = 'TEXT' | 'DEMO' | 'TASK'

export interface TutStep {
  type: StepType
  title: string
  text: string
  ascii?: string                 // preformatted diagram
  demo?: string                  // element to highlight: 'toolbar' | node label | 'hud'
  task?: 'addNode' | 'addEdge' | 'run' | 'check' | 'tspuMode' | 'blocked' | 'vpnTunneled' | 'addDns'
  taskHint?: string
}

export interface TutChapter { title: string; steps: TutStep[] }

export const TUTORIAL: TutChapter[] = [
  {
    title: 'Добро пожаловать в NetWars',
    steps: [
      { type: 'TEXT', title: 'ЧТО ТАКОЕ NETWAR?',
        ascii: '[U] ──→ [SW] ──→ [R] ──→ [T] ──→ [WS]\n                            ↕\n                         [VPN]',
        text: 'NetWars — симулятор компьютерных сетей. Ты строишь инфраструктуру, маршрутизируешь трафик, зарабатываешь биты и противостоишь ТСПУ — системе блокировок. Это не просто игра — здесь ты учишься как реально работает интернет.' },
      { type: 'TEXT', title: 'ДВА РЕЖИМА ИГРЫ',
        ascii: '┌─ TOPOLOGY ─┐   ┌─ SANDBOX ─┐\n│ Готовая    │   │ Строй сам! │\n│ сеть       │   │ Зарабатывай│\n│ Наблюдай   │   │ Защищайся  │\n└─ ОБУЧЕНИЕ ─┘   └─── ИГРА ───┘',
        text: 'TOPOLOGY — смотришь как работает реальная сеть. SANDBOX — строишь свою сеть с нуля. Начнём с Sandbox — ты будешь делать всё сам.' },
      { type: 'TEXT', title: 'ЭКОНОМИКА',
        text: 'Биты ⬡ — основная валюта. Зарабатываешь за доставку пакетов, тратишь на строительство и содержание. Чистые IP ◈ — редкий ресурс, нужны для VPN. Баланс = ДОХОД (пакеты летят) − РАСХОД (узлы работают). Если уходишь в минус — узлы отключаются!' },
      { type: 'TEXT', title: 'СОХРАНЕНИЯ КАК В GIT',
        text: 'NetWars использует систему сохранений как настоящий Git. Каждое сохранение = коммит: > save "настроил роутер". Рискованное изменение? > branch experiment. Хорошо? > merge experiment. Не понравилось? > checkout a1b2c3d. [HISTORY] покажет граф всех решений.' },
    ],
  },
  {
    title: 'Первые узлы',
    steps: [
      { type: 'DEMO', title: 'ПАНЕЛЬ ИНСТРУМЕНТОВ', demo: 'toolbar',
        text: 'Слева — панель инструментов. Здесь все узлы которые ты можешь добавить. Каждый узел — реальное сетевое устройство. Наведи на любой чтобы узнать о нём.' },
      { type: 'DEMO', title: 'USER [U]', demo: 'User',
        text: 'USER [U] — это ты или твой компьютер. Отсюда отправляются все запросы: браузер, мессенджеры, игры. Бесплатный! Можно добавить до 5 штук.' },
      { type: 'DEMO', title: 'SWITCH [SW]', demo: 'Switch',
        text: 'SWITCH [SW] — коммутатор. Работает на L2 уровне OSI. Знает только MAC-адреса, не видит IP. Как домашний Wi-Fi для локальной сети. Стоит 50 ⬡, расход −1 ⬡/сек.' },
      { type: 'DEMO', title: 'ROUTER [R]', demo: 'Router',
        text: 'ROUTER [R] — маршрутизатор. Работает на L3, видит IP. Выбирает куда отправить пакет по таблице маршрутов. Использует OSPF (внутри) и BGP (между сетями). Стоит 150 ⬡, расход −3 ⬡/сек.' },
      { type: 'TASK', title: 'ВРЕМЯ ДЕЙСТВОВАТЬ!', task: 'addNode', taskHint: 'Перетащи [U] на тёмный холст →',
        text: 'Перетащи USER из панели на холст. ↓ Попробуй прямо сейчас' },
    ],
  },
  {
    title: 'Строим первую сеть',
    steps: [
      { type: 'TEXT', title: 'МИНИМАЛЬНАЯ СЕТЬ', ascii: '[U] → [SW] → [R] → [FW] → [WS]',
        text: 'Минимальная рабочая сеть. User — источник запросов, Switch — объединяет в LAN, Router — выход в интернет, Firewall — защита сервера, WebServer — цель (сайт).' },
      { type: 'TASK', title: 'ДОБАВЬ SWITCH', task: 'addNode', taskHint: 'Перетащи [SW] на холст',
        text: 'Добавь Switch (SW). Он должен стоять между User и Router. Стоимость: 50 ⬡' },
      { type: 'TASK', title: 'СОЕДИНИ', task: 'addEdge', taskHint: 'Клик на User, затем клик на Switch',
        text: 'Соедини User и Switch. Нажми на User — выделится зелёным. Затем нажми на Switch — ребро создастся. Появится плашка "LAN — локальная сеть".' },
      { type: 'TASK', title: 'ДОБАВЬ ROUTER', task: 'addNode', taskHint: 'Добавь Router и соедини со Switch',
        text: 'Добавь Router (150 ⬡) и соедини со Switch.' },
      { type: 'TASK', title: 'ДОБАВЬ WEBSERVER', task: 'addNode', taskHint: 'Перетащи [WS] на холст',
        text: 'Добавь WebServer (200 ⬡). Это сервер к которому будет обращаться User. Пока без Firewall — упростим.' },
      { type: 'TASK', title: 'ЗАПУСК!', task: 'run', taskHint: 'Соедини Router→WS и нажми [RUN]',
        text: 'Соедини Router с WebServer. Потом нажми [RUN] чтобы запустить трафик! 🎉 Первый пакет — и ты построил работающую сеть!' },
    ],
  },
  {
    title: 'Соединения и правила',
    steps: [
      { type: 'TEXT', title: 'РАЗРЕШЁННЫЕ СОЕДИНЕНИЯ',
        ascii: 'User → Switch    ✓ домашняя LAN\nUser → WebServer ✗ нужен Router!\nUser → ТСПУ      ✗ ставит провайдер\nSwitch → Router  ✓ аплинк\nRouter → ТСПУ    ✓ через DPI\nRouter → VPN     ✓ туннель\nТСПУ → VPN       ⚠ не обойдёт так!',
        text: 'Некоторые соединения разрешены, некоторые — нет. Игра подскажет при создании ребра.' },
      { type: 'DEMO', title: 'ЗАПРЕЩЁННОЕ', demo: 'WebServer',
        text: 'User не может идти напрямую к WS. В реальной сети между ними всегда есть роутеры и коммутаторы. Попробуешь — увидишь красный ✗ badge, ребро не создастся.' },
      { type: 'TEXT', title: 'VPN И ТСПУ',
        ascii: 'НЕПРАВИЛЬНО:\n[R] → [T] → [VPN] → [FW]  ↑ ТСПУ блокирует!\n\nПРАВИЛЬНО:\n[R] → [T] → [FW]   ← заблокировано\n   ↘ [VPN] → [FW]  ← проходит!',
        text: '❌ ТСПУ → VPN — неправильно! Пакет идёт через ТСПУ, он его заблокирует. ✓ Правильно: Router → VPN → Firewall, параллельно ТСПУ.' },
      { type: 'TASK', title: 'ПРОВЕРКА', task: 'check', taskHint: 'Нажми [CHECK]',
        text: 'Проверь свою сеть — нажми [CHECK]. Посмотри на рекомендации.' },
      { type: 'TEXT', title: 'BADGE СОЕДИНЕНИЙ',
        text: 'При создании соединения: ✓ зелёный — можно, ⚠ жёлтый — нелогично но допустимо, ✗ красный — запрещено с объяснением почему.' },
    ],
  },
  {
    title: 'ТСПУ и блокировки',
    steps: [
      { type: 'TEXT', title: 'ТСПУ — ПРОТИВНИК', ascii: '[U] → [SW] → [R] → [ТСПУ] → [FW] → [WS]',
        text: 'ТСПУ — Deep Packet Inspection, глубокая инспекция пакетов. Стоит на сети каждого провайдера. Читает заголовки всех пакетов, блокирует по спискам РКН.' },
      { type: 'TEXT', title: 'ЧТО ВИДИТ ТСПУ',
        ascii: 'L3: IP dst: 1.2.3.4   ← IP сайта\nL4: TCP port: 443\nL7: SNI: blocked.com  ← ЭТО ОН ЧИТАЕТ!',
        text: 'SNI (Server Name Indication) — имя сайта передаётся открытым текстом даже в зашифрованном HTTPS. ТСПУ его читает.' },
      { type: 'TEXT', title: 'РЕЖИМЫ БЛОКИРОВКИ',
        text: '[По IP] — адрес в чёрном списке. Обход: VPN. [По SNI] — имя в TLS. Обход: VPN. [По DNS] — подмена ответа. Обход: DoH. [По порту 80] — весь HTTP. Обход: HTTPS.' },
      { type: 'TASK', title: 'РЕЖИМЫ ТСПУ', task: 'tspuMode', taskHint: 'Правый клик на ТСПУ → выбери режим',
        text: 'Нажми правой кнопкой на ТСПУ. Посмотри режимы блокировки. Попробуй переключить режим.' },
      { type: 'TASK', title: 'НАБЛЮДАЙ БЛОКИРОВКУ', task: 'blocked', taskHint: 'BLOCKED BY ТСПУ должен вырасти',
        text: 'Запусти трафик [RUN] и смотри как ТСПУ блокирует пакеты. Счётчик BLOCKED BY ТСПУ вырастет.' },
      { type: 'TEXT', title: 'ИТОГ',
        text: 'Теперь ты видишь как работает блокировка. В следующей главе научимся её обходить.' },
    ],
  },
  {
    title: 'VPN — обход блокировок',
    steps: [
      { type: 'TEXT', title: 'ИДЕЯ VPN',
        ascii: '┌ IP dst: vpn.server.nl ┐ ← ТСПУ видит только это\n│ ░░ ЗАШИФРОВАНО ░░    │\n│  ┌ IP: blocked.com ┐  │ ← ТСПУ не видит\n│  └ SNI: blocked.com┘  │\n└───────────────────────┘',
        text: 'VPN шифрует весь пакет и отправляет как будто мы идём на VPN сервер. ТСПУ видит только адрес VPN сервера — он не заблокирован!' },
      { type: 'TEXT', title: 'ДВА ПЛЕЧА',
        text: 'ПЛЕЧО 1: Ты → VPN сервер (зашифровано, ТСПУ слеп, +40-80мс). ПЛЕЧО 2: VPN сервер → blocked.com (от имени VPN). Итого два TCP соединения, склеенных посередине.' },
      { type: 'TEXT', title: 'ПРОТОКОЛЫ VPN',
        text: 'WireGuard — быстрый, но ТСПУ распознаёт по сигнатуре! VLESS — маскируется под HTTPS, самый стойкий к DPI. Shadowsocks — обфускация, частично блокируется.' },
      { type: 'TASK', title: 'ДОБАВЬ VPN', task: 'addNode', taskHint: 'Перетащи [VPN] (300⬡ + 1◈)',
        text: 'Добавь VPN сервер. Стоимость: 300 ⬡ + 1 ◈. ВАЖНО: VPN должен идти ПАРАЛЛЕЛЬНО ТСПУ, не через него!' },
      { type: 'TASK', title: 'ПОДКЛЮЧИ VPN', task: 'addEdge', taskHint: 'Router→VPN и VPN→Firewall',
        text: 'Соедини Router → VPN и VPN → Firewall. Router→ТСПУ→Firewall заблокировано, Router→VPN→Firewall — обход!' },
      { type: 'TASK', title: 'ТУННЕЛИРУЙ', task: 'vpnTunneled', taskHint: 'VPN TUNNELED должен вырасти',
        text: 'Кликни на User, выбери VPN: VLESS, назначение blocked.com. Нажми RUN и смотри на счётчик VPN TUNNELED.' },
      { type: 'TEXT', title: '🎉 ТЫ ОБОШЁЛ ТСПУ!',
        text: 'Пакеты к blocked.com проходят через VPN. ТСПУ видит только зашифрованный поток к vpn-серверу. Именно так работают миллионы пользователей в России каждый день.' },
    ],
  },
  {
    title: 'DNS — адресная книга интернета',
    steps: [
      { type: 'TEXT', title: 'КАК БРАУЗЕР НАХОДИТ СЕРВЕР',
        text: 'Ты вводишь google.com. Браузер не знает что это. Нужно узнать IP — спросить DNS. DNS (Domain Name System) переводит имена в IP адреса. Это адресная книга интернета.' },
      { type: 'TEXT', title: 'ИЕРАРХИЯ DNS',
        ascii: 'User → Stub → Recursive → Root\n                          ↓\n          Auth ← TLD ← Root\n          142.250.1.1',
        text: '1.Stub (локальный) 2.Recursive (провайдер) 3.Root (13 серверов!) 4.TLD (.com) 5.Auth (ns1.google) → IP. Весь процесс ~80-150мс.' },
      { type: 'TEXT', title: 'ТСПУ АТАКУЕТ DNS',
        text: 'Стандартный DNS (порт 53 UDP) не зашифрован! ТСПУ видит "пользователь спрашивает blocked.com". Подмена ответа или блокировка. Защита: DoH/DoT — шифруют запросы, ТСПУ слеп.' },
      { type: 'TASK', title: 'ДОБАВЬ DNS', task: 'addDns', taskHint: 'Добавь DNS и соедини с User/Router',
        text: 'Добавь DNS сервер. Соедини User → DNS → Router. Стоимость: 100 ⬡.' },
      { type: 'TEXT', title: 'ИТОГ',
        text: 'Теперь у тебя есть DNS. Счётчик DNS RESOLVED начнёт расти. В следующей главе — экономика и оптимизация.' },
    ],
  },
  {
    title: 'Экономика и оптимизация',
    steps: [
      { type: 'TEXT', title: 'ДОХОД > РАСХОД',
        text: 'Каждый узел стоит битов в секунду. Задача: доход > расход. РАСХОД −12 ⬡/сек (узлы), ДОХОД +18 ⬡/сек (пакеты), БАЛАНС +6 ⬡/сек ← нужно быть в плюсе!' },
      { type: 'TEXT', title: 'ОПТИМИЗАЦИЯ',
        text: 'Снизить расход: удали лишние узлы, дешёвые маршруты, CDN кэширует. VPN дорог (−5 ⬡/сек) — только когда нужен. Увеличить доход: больше User, VPN +8 ⬡/пакет, CDN кэш-хиты +4 ⬡.' },
      { type: 'DEMO', title: 'HUD ЭКОНОМИКИ', demo: 'hud',
        text: 'Смотри на HUD справа вверху: БИТЫ — баланс, РАСХОД (красным), ДОХОД (зелёным), БАЛАНС — итог. Минус → узлы отключаются!' },
      { type: 'TEXT', title: 'GIT-СОХРАНЕНИЯ',
        text: 'Рискованная перестройка? В терминале: > save "перед экспериментом", > branch experiment. Плохо? > checkout [хэш]. Хорошо? > merge experiment.' },
      { type: 'TEXT', title: '🎉 ТУТОРИАЛ ЗАВЕРШЁН!',
        text: 'Ты узнал: строить сеть, как работают Switch/Router/Firewall, что такое ТСПУ и как обходить через VPN, как работает DNS, управлять экономикой, использовать Git-сохранения. Теперь изучи TOPOLOGY — там реальная топология интернета. Удачи! 🚀' },
    ],
  },
]
