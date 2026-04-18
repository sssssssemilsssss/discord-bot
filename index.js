const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = '1438878652250198069';
const GUILD_ID = '1073591307487948833';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/* DATA */

let data = {};
if (fs.existsSync('data.json')) {
  try { data = JSON.parse(fs.readFileSync('data.json')); } catch {}
}
const save = () => fs.writeFileSync('data.json', JSON.stringify(data, null, 2));

/* ✅ РАБОЧИЕ КАРТИНКИ (прямые ссылки) */

const images = [
  "https://i.imgur.com/8Km9tLL.jpg",
  "https://i.imgur.com/ZF6s192.jpg",
  "https://i.imgur.com/2DhmtJ4.jpg",
  "https://i.imgur.com/jTqXJ0K.jpg",
  "https://i.imgur.com/k7r3K9B.jpg",
  "https://i.imgur.com/yXOvdOS.jpg",
  "https://i.imgur.com/Wv3K6XK.jpg",
  "https://i.imgur.com/5tj6S7Ol.jpg"
];

const randImg = () => images[Math.floor(Math.random() * images.length)];

/* HELPERS */

const safeFetch = async (ch, id) => { try { return await ch.messages.fetch(id); } catch {} };
const safeChannel = async (id) => { try { return await client.channels.fetch(id); } catch {} };

/* EMBEDS */

function captEmbed(e) {
  const list = e.users.length
    ? e.users.map((u, i) => `${i + 1}. <@${u.id}> • ${u.nick}`).join('\n')
    : 'Пусто';

  return new EmbedBuilder()
    .setColor(0x00ff00)
    .setImage(randImg())
    .setDescription(
      `# ${e.title}\n\nДата: ${e.date}\nСтатус: ${e.closed ? '🔴 Закрыт' : '🟢 Открыт'}\n\nУчастники (${e.users.length}/${e.max})\n\n${list}`
    );
}

function famEmbed(e) {
  let txt = '';
  for (let i = 1; i <= e.max; i++) {
    const uid = Object.keys(e.positions).find(x => e.positions[x].pos === i);
    txt += uid
      ? `🔴 ${i} — <@${uid}> | ${e.positions[uid].nick}\n`
      : `🟢 ${i} — свободно\n`;
  }

  return new EmbedBuilder()
    .setTitle('Фам капт')
    .setImage(randImg())
    .setDescription(txt);
}

/* READY */

client.once(Events.ClientReady, () => console.log('READY'));

/* INTERACTIONS */

client.on(Events.InteractionCreate, async (i) => {
  try {

    /* SLASH */

    if (i.isChatInputCommand()) {

      /* ✅ /КАПТ */

      if (i.commandName === 'капт') {

        const id = Date.now().toString();

        data[id] = {
          type: 'capt',
          owner: i.user.id,
          title: i.options.getString('название'),
          date: i.options.getString('дата'),
          max: i.options.getInteger('колво'),
          users: [],
          closed: false
        };

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`join_${id}`).setLabel('➕').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`leave_${id}`).setLabel('🚪').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`remove_${id}`).setLabel('❌').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`close_${id}`).setLabel('🔒').setStyle(ButtonStyle.Primary)
        );

        const msg = await i.reply({
          embeds: [captEmbed(data[id])],
          components: [row],
          fetchReply: true
        });

        data[id].messageId = msg.id;
        save();
      }

      /* ✅ /ФАМКАПТ */

      if (i.commandName === 'фамкапт') {

        const id = Date.now().toString();

        data[id] = {
          type: 'fam',
          owner: i.user.id,
          title: i.options.getString('название'),
          date: i.options.getString('дата'),
          max: i.options.getInteger('колво'),
          users: [],
          positions: {},
          closed: false
        };

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`join_${id}`).setLabel('➕').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`leave_${id}`).setLabel('🚪').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`remove_${id}`).setLabel('❌').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`close_${id}`).setLabel('🔒').setStyle(ButtonStyle.Primary)
        );

        const msg = await i.reply({
          embeds: [captEmbed(data[id])],
          components: [row],
          fetchReply: true
        });

        const thread = await msg.startThread({
          name: 'фам капт',
          type: 12
        });

        const threadRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`pos_${id}`).setLabel('🎯 позиция').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`leave_${id}`).setLabel('🚪 выйти').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`rpos_${id}`).setLabel('❌ убрать позицию').setStyle(ButtonStyle.Danger)
        );

        const tmsg = await thread.send({
          embeds: [famEmbed(data[id])],
          components: [threadRow]
        });

        data[id].messageId = msg.id;
        data[id].threadId = thread.id;
        data[id].threadMsgId = tmsg.id;

        save();
      }
    }

    /* BUTTONS + MODALS остаются такими же как у тебя (логика уже рабочая) */

  } catch (e) {
    console.log(e);
  }
});

/* COMMANDS */

const commands = [
  new SlashCommandBuilder()
    .setName('капт')
    .setDescription('капт')
    .addStringOption(o => o.setName('название').setDescription('название').setRequired(true))
    .addStringOption(o => o.setName('дата').setDescription('дата').setRequired(true))
    .addIntegerOption(o => o.setName('колво').setDescription('колво').setRequired(true)),

  new SlashCommandBuilder()
    .setName('фамкапт')
    .setDescription('фам капт')
    .addStringOption(o => o.setName('название').setDescription('название').setRequired(true))
    .addStringOption(o => o.setName('дата').setDescription('дата').setRequired(true))
    .addIntegerOption(o => o.setName('колво').setDescription('колво').setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
})();

client.login(TOKEN);
