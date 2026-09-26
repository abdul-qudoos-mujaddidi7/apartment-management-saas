/**
 * The starting point for an organization's contract.
 *
 * These are *defaults*, not terms of art. Everything here is copied into the
 * organization's own settings row and clause rows the first time its contract
 * settings are read, and from that moment the rows are the contract — editing,
 * disabling, reordering or deleting one here changes nothing for an organization
 * that already has its own.
 *
 * The document is the one an Afghan lease office actually issues, so the wording
 * is that office's, not the application's: a statement of who lets what to whom
 * and on what terms, the condition the unit and its fittings are handed over in,
 * the numbered conditions the parties agree to, the signatures, and the notes
 * that qualify the whole. Every one of them is a template — the `{{tokens}}` are
 * resolved from the lease that is open, and the closed list of tokens is in
 * `lease-contract.placeholders.js`.
 *
 * The English text of each template is required, because it is what a blank
 * translation falls back to; Dari and Pashto carry the document's own voice, and
 * an organization that edits one language never has the others disturbed.
 */

const DEFAULT_SETTINGS = {
  defaultLanguage: 'fa',

  titleEn: 'Apartment Lease Agreement',
  titleFa: 'قرارداد کرایه واحد آپارتمانی',
  titlePs: 'د اپارتمان د کرایې تړون',

  /* --- The statement of tenancy -----------------------------------------
     One paragraph, read as a single sentence with the values written into it:
     who lets, what unit, to whom, for how long, at what rent.

     Two details of the office's printed form have nowhere in the records to
     come from: the title deed number the unit is recorded under, and whether
     the kitchen is open. The first is therefore ruled as a blank — the office
     enters it by hand, exactly as it does on the paper form — and the second is
     written into the wording, where the office can change it if its buildings
     differ. Everything else is a `{{token}}` and is filled from the lease. */
  preambleEn:
    'This contract is made by {{contract.officeName}}, which has full legal and Sharia capacity and acts without coercion and with complete consent, and which undertakes: one apartment comprising ({{apartment.bedrooms}}) living rooms, one open kitchen and ({{apartment.bathrooms}}) bathrooms, situated in {{building.name}}, floor ({{floor.floorNumber}}), unit number ({{apartment.apartmentNumber}}), {{building.address}}, recorded in Sharia title deed number (..........), which establishes the ownership of ({{contract.lessorName}}), with an area of ({{apartment.area}}) square metres, let to Mr. {{tenant.fullName}} son of {{tenant.fatherName}}, holder of identity document number ({{tenant.nationalId}}), originally resident of ({{tenant.address}}), telephone ({{tenant.phone}}), for a period of ({{lease.durationMonths}}) months, from {{lease.startDate}} to {{lease.endDate}}, at a monthly rent of ({{lease.monthlyRent}}).',
  preambleFa:
    'مدیریت {{contract.officeName}} که دارای اهلیت کامل شرعی و حقوقی می‌باشد، بدون جبر و اکراه، با رضایت و رغبت کامل متعهد است که: یک دربند واحد آپارتمانی دارای ({{apartment.bedrooms}}) اطاق نشیمن، یک آشپزخانه اوپن و ({{apartment.bathrooms}}) تشناب، واقع در {{building.name}} منزل ({{floor.floorNumber}})، واحد نمبر ({{apartment.apartmentNumber}})، {{building.address}}، مندرج قباله شرعی نمبر (..........)، که ملکیت ({{contract.lessorName}}) را تثبیت می‌نماید، به مساحت ({{apartment.area}}) متر مربع را به محترم {{tenant.fullName}} ولد {{tenant.fatherName}}، دارنده تذکره نمبر ({{tenant.nationalId}})، باشنده اصلی ({{tenant.address}})، شماره تماس ({{tenant.phone}})، برای مدت ({{lease.durationMonths}}) ماه، از تاریخ {{lease.startDate}} الی {{lease.endDate}}، در بدل مبلغ ({{lease.monthlyRent}}) ماهانه به کرایه بدهد.',
  preamblePs:
    'د {{contract.officeName}} اداره چې بشپړ شرعي او حقوقي اهلیت لري، پرته له جبر او اکراه، په بشپړ رضایت سره ژمنه کوي چې: یو باب اپارتمان چې ({{apartment.bedrooms}}) استوګنځي کوټې، یو خلاص پخلنځی او ({{apartment.bathrooms}}) تشنابونه لري، په {{building.name}} کې، منزل ({{floor.floorNumber}})، د واحد نمبر ({{apartment.apartmentNumber}})، {{building.address}}، چې د شرعي قبالې نمبر (..........) کې ثبت دی او د ({{contract.lessorName}}) ملکیت ثابتوي، په ({{apartment.area}}) مربع متره مساحت، محترم {{tenant.fullName}} ولد {{tenant.fatherName}}، د تذکرې نمبر ({{tenant.nationalId}}) لرونکي، د ({{tenant.address}}) اوسېدونکي، د تلیفون نمبر ({{tenant.phone}}) سره، د ({{lease.durationMonths}}) میاشتو لپاره، له {{lease.startDate}} څخه تر {{lease.endDate}} پورې، په میاشتني ({{lease.monthlyRent}}) کرایه ورکړي.',

  /* --- The condition the unit is handed over in ------------------------- */
  inventoryEn:
    'All the fittings of the apartment (the building) — painted walls, frames and hinges, concealed lighting, handles and door locks, water taps and the rest — are sound and in working order. On handover every one of them must be handed back as sound and as serviceable as it was handed out, and the rent, utility charges and service fees outstanding at that date are settled.',
  inventoryFa:
    'همچنان تمام وسایل واحد آپارتمانی (تعمیر) از قبیل رنگ بلاک، گروپ‌ها و هلوجن‌ها، نور مخفی، دستگیر و قفل دروازه‌ها، نل‌های آب و غیره صحیح و درست می‌باشد، و در وقت تسلیمی باید تمام وسایل که قبلاً برای کرایه‌نشین صحیح و درست تسلیم داده شده بود دوباره صحیح و سالم تسلیم گردد.',
  inventoryPs:
    'همدارنګه د اپارتمان (ودانۍ) ټول تجهیزات لکه د دیوالونو رنګ، ګروپونه او هلوجنونه، پټه رڼا، د دروازو دستګیرې او قلفونه، د اوبو نلونه او نور سم او روغ دي، او د سپارلو پر مهال باید هغه ټول تجهیزات چې مخکې کرایه‌کوونکي ته سم او روغ سپارل شوي وو، بیا هم سم او روغ وسپارل شي.',

  /* --- The headings, and the notes -------------------------------------- */
  termsTitleEn: 'Terms of the contract',
  termsTitleFa: 'شرایط قرارداد',
  termsTitlePs: 'د تړون شرایط',

  notesTitleEn: 'Notes',
  notesTitleFa: 'یادداشت',
  notesTitlePs: 'یادښت',

  notesEn:
    'An amount of ({{lease.securityDeposit}}) was paid by {{tenant.fullName}} son of {{tenant.fatherName}} as a security deposit / advance on this contract, and a receipt was issued.\nThe monthly rent is paid to the person responsible for the apartment at the beginning of every month.\nThe monthly service fee for this unit is ({{lease.serviceFee}}), collected from the tenant at the beginning of every month.\nThe electricity charge is calculated per kilowatt hour at the standing official tariff.',
  notesFa:
    'مبلغ ({{lease.securityDeposit}}) به نام {{tenant.fullName}} ولد {{tenant.fatherName}} به صورت تضمین / ادوانس پرداخت و قبض گردید.\nکرایه ماهانه در آغاز هر ماه به مسؤول / مدیریت آپارتمان پرداخت می‌گردد.\nفیس ماهانه خدمات این واحد ({{lease.serviceFee}}) می‌باشد که در آغاز هر ماه از کرایه‌گیرنده دریافت می‌گردد.\nفیس برق فی کیلووات مطابق تعرفه رسمی محاسبه می‌گردد.',
  notesPs:
    'له {{tenant.fullName}} ولد {{tenant.fatherName}} څخه د ({{lease.securityDeposit}}) اندازه د دې تړون لپاره د تضمین / پیش‌پرداخت په توګه ورکړل شوه او رسید صادر شو.\nمیاشتنۍ کرایه د هرې میاشتې په پیل کې د اپارتمان مسؤل / مدیریت ته ورکول کېږي.\nد دې واحد میاشتنی د خدمت فیس ({{lease.serviceFee}}) دی چې د هرې میاشتې په پیل کې له کرایه‌کوونکي اخیستل کېږي.\nد بریښنا فیس د کیلوواټ په حساب د رسمي تعرفې له مخې محاسبه کېږي.',

  /* The signature captions the office writes on the line. Left null, each is
     named in the contract's own language, which is why nothing is set here. */
  lessorSignatureLabel: null,
  tenantSignatureLabel: null,
  witnessSignatureLabel: null,

  showTenantPhoto: true,
  showLessorPhoto: false,
};

/* --- The numbered conditions -------------------------------------------
   Untitled on purpose: the printed form numbers its conditions and writes them
   out, and a heading above each one would be words the office never agreed to.
   The settings list falls back to the first line of the text instead. */
const DEFAULT_CLAUSES = [
  {
    titleEn: '',
    titleFa: '',
    titlePs: '',
    bodyEn:
      'If this contract is withdrawn from by either party for a defect, in accordance with Sharia, the matter is settled under the standing rules of the office that issued it.',
    bodyFa:
      'در صورت که قرارداد از طرف یکی از جانبین بنابر احکام شرعی به اثر کدام عیب مسترد گردد، در این صورت طبق قوانین رهنما عمل می‌شود.',
    bodyPs:
      'که د دواړو لوریو څخه یو لوری د شرعي احکامو له مخې د کوم عیب له امله له تړون څخه واوړي، نو د رهنما دفتر د قوانینو له مخې به عمل وشي.',
  },
  {
    titleEn: '',
    titleFa: '',
    titlePs: '',
    bodyEn:
      'The tenant may not give the property to anyone else, whether as a pledge or as rent, without the permission of the apartment owner.',
    bodyFa:
      'کرایه‌گیرنده نمی‌تواند جایداد را به شخص دیگری به گروی یا کرایه بدون اجازه مالک اپارتمان بدهد.',
    bodyPs:
      'کرایه‌کوونکی نه شي کولای ملکیت د اپارتمان د مالک له اجازې پرته بل چا ته د ګرو یا کرایې په توګه ورکړي.',
  },
  {
    titleEn: '',
    titleFa: '',
    titlePs: '',
    bodyEn:
      'The apartment is handed over to the tenant by the owner or the property manager against an inventory signed by both parties. When the contract is ended and the unit vacated, the property is handed back to the person responsible for the apartment against that same inventory.',
    bodyFa:
      'واحد آپارتمانی طبق سجل توسط مالک یا مدیر جایداد برای کرایه‌گیرنده بالترتیب به امضای هر دو جانب تسلیم داده می‌شود. در وقت تخلیه و فسخ قرارداد، طبق همان سجل دوباره ملکیت به مسؤول اپارتمان تسلیم داده شود.',
    bodyPs:
      'اپارتمان د مالک یا د ملکیت مدیر له خوا کرایه‌کوونکي ته د یوه سجل له مخې چې د دواړو لوریو لاسلیک پر وي سپارل کېږي. د تخلیې او د تړون د پای پر مهال به ملکیت د هماغه سجل له مخې بیا د اپارتمان مسؤل ته سپارل شي.',
  },
  {
    titleEn: '',
    titleFa: '',
    titlePs: '',
    bodyEn:
      'If a neighbour complains about the tenant, the owner of the property has the right to end this contract unilaterally, without compensation for loss.',
    bodyFa:
      'در صورت کدام شکایت همسایه‌گان از کرایه‌گیرنده، مالک جایداد حق فسخ قرارداد یک‌جانبه را بدون جبران خساره دار می‌باشد.',
    bodyPs:
      'که د کرایه‌کوونکي په هکله د ګاونډیانو کوم شکایت وي، د ملکیت مالک حق لري چې تړون یواړخیزه پرته له تاوان جبران پای ته ورسوي.',
  },
  {
    titleEn: '',
    titleFa: '',
    titlePs: '',
    bodyEn:
      'The lessor and the tenant, each of full legal and Sharia capacity, have come to this agreement together, and each is truthful in what has been affirmed above.',
    bodyFa:
      'ما بین کرایه‌دهنده و کرایه‌گیرنده در حالیکه دارای اهلیت کامل شرعی و حقوقی خویش بودیم، با هم به موافقه رسیدیم و در اقرار خویش صادق می‌باشیم.',
    bodyPs:
      'کرایه ورکوونکی او کرایه‌کوونکی، دواړه د خپل بشپړ شرعي او حقوقي اهلیت سره، په یوه خوله دې موافقې ته ورسېدو او په خپل اقرار کې رښتیا وایو.',
  },
  {
    titleEn: '',
    titleFa: '',
    titlePs: '',
    bodyEn: 'This contract is extended by the agreement of both parties.',
    bodyFa: 'تمدید این قرارداد نظر به موافقه جانبین صورت می‌گیرد.',
    bodyPs: 'د دې تړون غځول د دواړو لوریو د موافقې له مخې ترسره کېږي.',
  },
];

module.exports = { DEFAULT_CLAUSES, DEFAULT_SETTINGS };
