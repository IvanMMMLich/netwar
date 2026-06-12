import { NodeType } from './topology'

export interface NodeCapability {
  can:       string[]
  cannot:    string[]
  protocols: string[]
}

export const NODE_CAPABILITY: Record<NodeType, NodeCapability> = {
  User: {
    can: [
      'Инициировать HTTP/HTTPS запросы',
      'Отправлять DNS-запросы',
      'Устанавливать VPN-туннель',
      'Выбирать DNS-резолвер (DoH/DoT)',
    ],
    cannot: [
      'Читать трафик других пользователей',
      'Маршрутизировать пакеты',
      'Обходить ТСПУ без VPN/прокси',
    ],
    protocols: ['HTTP/1.1', 'HTTPS / TLS 1.3', 'DNS UDP 53', 'DoH HTTPS 443', 'WireGuard UDP', 'VLESS TCP'],
  },
  Switch: {
    can: [
      'Пересылать фреймы по MAC-адресу',
      'Строить таблицу CAM',
      'Поддерживать VLAN (802.1Q)',
      'Делать flood для неизвестных MAC',
    ],
    cannot: [
      'Читать IP-заголовки',
      'Выполнять маршрутизацию',
      'Видеть содержимое TCP/UDP',
      'Фильтровать трафик по домену',
    ],
    protocols: ['Ethernet (L2)', '802.1Q VLAN', 'STP / RSTP', 'LLDP'],
  },
  ISP: {
    can: [
      'Маршрутизировать пакеты по IP',
      'Видеть source и destination IP',
      'Выполнять NAT',
      'Менять маршруты через BGP',
    ],
    cannot: [
      'Читать TCP payload без MITM',
      'Расшифровать HTTPS',
      'Видеть содержимое VPN-туннеля',
      'Видеть SNI в ECH',
    ],
    protocols: ['IP / IPv6', 'BGP (между AS)', 'OSPF (внутри AS)', 'ICMP', 'NAT'],
  },
  ТСПУ: {
    can: [
      'Читать IP src/dst заголовки',
      'Читать TCP/UDP порты',
      'Читать SNI в TLS ClientHello',
      'Читать незашифрованные DNS',
      'Блокировать по IP и домену',
      'Подменять DNS-ответы',
      'Инжектировать TCP RST',
    ],
    cannot: [
      'Расшифровать HTTPS контент',
      'Видеть внутренний IP в VPN',
      'Читать SNI в ECH (зашифрован)',
      'Читать DoH/DoT запросы',
      'Блокировать неизвестные IP VPN',
    ],
    protocols: ['DPI (L3-L7)', 'IP / TCP / UDP', 'DNS перехват', 'HTTPS SNI анализ'],
  },
  VPN: {
    can: [
      'Шифровать весь трафик в туннель',
      'Скрыть реальный IP назначения',
      'Заменить IP-заголовок',
      'Обойти SNI-инспекцию',
      'Обойти DNS-блокировку ISP',
    ],
    cannot: [
      'Скрыть факт использования VPN',
      'Защитить от утечек DNS',
      'Гарантировать анонимность',
      'Работать если IP заблокирован',
    ],
    protocols: ['WireGuard UDP 51820', 'VLESS TCP 443', 'Shadowsocks TCP/UDP', 'OpenVPN UDP 1194'],
  },
  Firewall: {
    can: [
      'Фильтровать по IP, порту, протоколу',
      'Выполнять stateful inspection',
      'Блокировать нежелательные соединения',
      'Делать NAT / PAT',
    ],
    cannot: [
      'Расшифровать HTTPS без MITM',
      'Анализировать зашифрованный контент',
      'Видеть реальный IP за VPN',
    ],
    protocols: ['iptables / nftables', 'IP / TCP / UDP', 'ICMP', 'Stateful TCP'],
  },
  WebServer: {
    can: [
      'Принимать HTTP/HTTPS запросы',
      'Терминировать TLS (HTTPS)',
      'Отдавать контент клиентам',
      'Логировать все соединения',
    ],
    cannot: [
      'Знать реальный IP клиента за VPN/NAT',
      'Предотвратить DDoS без защиты',
    ],
    protocols: ['HTTP/1.1', 'HTTP/2', 'HTTPS / TLS 1.3', 'WebSocket'],
  },
  DNS_R: {
    can: [
      'Принимать DNS-запросы от клиентов',
      'Кэшировать ответы',
      'Рекурсивно опрашивать иерархию',
      'Поддерживать DoH / DoT',
    ],
    cannot: [
      'Гарантировать подлинность без DNSSEC',
      'Скрыть запросы от ISP (обычный DNS)',
    ],
    protocols: ['DNS UDP 53', 'DNS TCP 53', 'DoH HTTPS 443', 'DoT TLS 853', 'DNSSEC'],
  },
  DNS_ROOT: {
    can: [
      'Указывать на TLD-серверы',
      'Обрабатывать все TLD (.com/.ru/...)',
      'Участвовать в DNSSEC цепочке',
    ],
    cannot: [
      'Знать реальные IP сайтов',
      'Кэшировать большинство ответов',
    ],
    protocols: ['DNS UDP 53', 'DNSSEC', 'Anycast'],
  },
  DNS_TLD: {
    can: [
      'Указывать на авторитативные NS',
      'Обрабатывать зоны .com .net .ru',
      'Поддерживать DNSSEC для зоны',
    ],
    cannot: [
      'Знать реальные IP сайтов',
    ],
    protocols: ['DNS UDP 53', 'DNSSEC'],
  },
  DNS_AUTH: {
    can: [
      'Возвращать реальный IP домена',
      'Хранить A/AAAA/MX/CNAME/TXT записи',
      'Поддерживать DNSSEC подписи',
    ],
    cannot: [
      'Быть доступен без прохождения цепочки',
      'Скрыть IP от ISP при обычном DNS',
    ],
    protocols: ['DNS UDP 53', 'DNSSEC', 'DNS TCP 53'],
  },
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

export interface ScenarioStep {
  title:       string
  description: string
  highlight:   string[]  // node IDs to highlight
  explanation: string
  choices?:    { label: string; key: string; value: string; outcome: string }[]
}

export interface Scenario {
  id:          number
  title:       string
  summary:     string
  steps:       ScenarioStep[]
}

export const SCENARIOS: Scenario[] = [
  {
    id: 1,
    title: 'HTTP запрос на site.com',
    summary: 'User пытается достучаться до WebServer — ТСПУ блокирует',
    steps: [
      {
        title: 'Шаг 1 — Пакет отправлен',
        highlight: ['user1', 'sw1', 'isp1'],
        description: 'User отправляет HTTP GET /index.html на IP WebServer (93.184.216.34)',
        explanation: 'Пакет идёт через Switch (L2) → ISP Router (L3). На этом этапе ТСПУ ещё не видел трафик.',
      },
      {
        title: 'Шаг 2 — ТСПУ инспектирует',
        highlight: ['tspu1'],
        description: 'Пакет попадает в ТСПУ. Протокол HTTP, destination IP = 93.184.216.34.',
        explanation: 'ТСПУ читает IP-заголовок и видит destination IP. Если IP в чёрном списке — пакет дропается. При HTTPS ТСПУ читает SNI в TLS ClientHello.',
      },
      {
        title: 'Шаг 3 — Блокировка',
        highlight: ['tspu1'],
        description: '⚠ ТСПУ: IP 93.184.216.34 в реестре. TCP RST → клиенту.',
        explanation: 'Клиент получает TCP RST — соединение сброшено. Браузер показывает "Connection Reset".',
        choices: [
          { label: 'Включить VPN',   key: 'vpn', value: 'WireGuard', outcome: 'Пакеты теперь идут в VPN-туннеле. ТСПУ видит только IP VPN-сервера.' },
          { label: 'Попробовать HTTPS', key: 'application', value: 'HTTPS', outcome: 'ТСПУ видит SNI = site.com и блокирует по домену.' },
        ],
      },
      {
        title: 'Шаг 4 — Обход через VPN',
        highlight: ['user1', 'tspu1', 'vpn1', 'fw1', 'ws1'],
        description: 'VPN активен: User → ТСПУ → VPN сервер → Firewall → WebServer',
        explanation: 'ТСПУ видит только: src=User_IP, dst=VPN_IP, протокол=WireGuard/UDP. Реальный destination скрыт внутри туннеля.',
      },
    ],
  },
  {
    id: 2,
    title: 'DNS резолюция site.com',
    summary: 'Полная цепочка DNS: Recursive → Root → TLD → Auth',
    steps: [
      {
        title: 'Шаг 1 — Запрос к Recursive DNS',
        highlight: ['user1', 'dnsr1'],
        description: 'User: "Что такое site.com?" → DNS-R получает запрос на порт 53 UDP',
        explanation: 'Если DNS-R нет в кэше — он начинает рекурсивный поиск. Если ISP подменяет DNS — ответ уже здесь будет неправильным.',
      },
      {
        title: 'Шаг 2 — Root DNS',
        highlight: ['dnsr1', 'dnsroot1'],
        description: 'DNS-R → Root: "Кто отвечает за .com?" → Root возвращает NS серверы TLD',
        explanation: 'Root DNS (13 кластеров Anycast) знают адреса TLD-серверов для всех зон: .com .net .ru .org ...',
      },
      {
        title: 'Шаг 3 — TLD DNS',
        highlight: ['dnsroot1', 'dnstld1'],
        description: 'DNS-R → TLD: "Кто отвечает за site.com?" → TLD возвращает NS серверы Auth',
        explanation: 'TLD-серверы (.com управляются Verisign) хранят записи NS для всех доменов в зоне.',
      },
      {
        title: 'Шаг 4 — Authoritative DNS',
        highlight: ['dnstld1', 'dnsauth1', 'dnsr1', 'user1'],
        description: 'DNS-R → Auth: "A-запись site.com?" → Auth: "93.184.216.34" → User',
        explanation: 'Auth DNS знает реальный IP. Ответ возвращается по цепочке обратно к User.',
        choices: [
          { label: 'Обычный DNS',  key: 'dns', value: 'DNS',  outcome: 'ТСПУ может прочитать запрос и подменить ответ.' },
          { label: 'DNS-over-HTTPS', key: 'dns', value: 'DoH', outcome: 'Запрос зашифрован, ТСПУ видит только HTTPS на порт 443.' },
          { label: 'DNS-over-TLS',   key: 'dns', value: 'DoT', outcome: 'Запрос зашифрован, ТСПУ видит только TLS на порт 853.' },
        ],
      },
    ],
  },
  {
    id: 3,
    title: 'VPN туннель — инкапсуляция',
    summary: 'Как пакет заворачивается в туннель и что видит ТСПУ',
    steps: [
      {
        title: 'Шаг 1 — Исходный пакет',
        highlight: ['user1'],
        description: 'Исходный пакет: [Ethernet | IP src=User dst=93.184.216.34 | TCP | HTTP GET]',
        explanation: 'Без VPN ТСПУ видит полный заголовок: src/dst IP, порт, SNI, протокол.',
      },
      {
        title: 'Шаг 2 — VPN инкапсуляция',
        highlight: ['user1', 'vpn1'],
        description: 'VPN оборачивает пакет: [IP src=User dst=VPN | WireGuard/UDP | ЗАШИФРОВАНО: IP+TCP+HTTP]',
        explanation: 'Исходный пакет шифруется. ТСПУ видит только внешний IP-заголовок: src=User_IP, dst=VPN_IP, протокол=UDP.',
      },
      {
        title: 'Шаг 3 — ТСПУ не может прочитать',
        highlight: ['tspu1'],
        description: 'ТСПУ: src=User, dst=VPN_IP, UDP. Содержимое зашифровано — не читается.',
        explanation: 'ТСПУ видит что-то летит на VPN сервер. Может заблокировать VPN IP если знает его. Иначе — трафик проходит.',
        choices: [
          { label: 'WireGuard',    key: 'vpn', value: 'WireGuard',    outcome: 'UDP трафик, легко обнаружить по порту 51820.' },
          { label: 'VLESS (443)',  key: 'vpn', value: 'VLESS',        outcome: 'Маскируется под HTTPS. Тяжело заблокировать без MITM.' },
          { label: 'Shadowsocks', key: 'vpn', value: 'Shadowsocks',   outcome: 'Случайный шум, сложно отличить от обычного трафика.' },
        ],
      },
      {
        title: 'Шаг 4 — Расшифровка на VPN сервере',
        highlight: ['vpn1', 'fw1', 'ws1'],
        description: 'VPN сервер расшифровывает пакет → Firewall проверяет → WebServer отвечает',
        explanation: 'Второе плечо: от VPN до WebServer трафик снова открытый (или HTTPS). WebServer видит IP VPN-сервера, не User.',
      },
    ],
  },
]
