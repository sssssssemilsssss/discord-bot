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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* ───── DATA ───── */

let events = {};
if (fs.existsSync('data.json')) {
  events = JSON.parse(fs.readFileSync('data.json'));
}

function save() {
  fs.writeFileSync('data.json', JSON.stringify(events, null, 2));
}

/* ───── CAPT EMBED (1в1) ───── */

function createCapt(event) {
  const list = event.users.length
    ? event.users.map((u, i) => `${i + 1}. <@${u.id}> • ${u.nick}`).join('\n')
    : 'Пока никого нет';

  return new EmbedBuilder()
    .setColor(0x00ff00)
    .setDescription(
      `# ${event.title}\n\n` +
      `**Создал:** <@${event.owner}>\n` +
      `**Дата:** ${event.date}\n\n` +
      `**Участники (${event.users.length}/${event.max})**\n\n` +
      list
    )
    .setTimestamp();
}

/* ───── FAM EMBED ───── */

function createFam(event) {
  let text = '';

  for (let i = 1; i <= event.max; i++) {
    const uid = Object.keys(event.positions)
      .find(id => event.positions[id].pos === i);

    if (!uid) text += `🟢 ${i} — свободно\n`;
    else {
      const u = event.positions[uid];
      text += `🔴 ${i} — <@${uid}> | ${u.nick}\n`;
    }
  }

  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`Фам капт`)
    .setDescription(text);
}

/* ───── READY ───── */

client.once(Events.ClientReady, () => {
  console.log(`Бот запущен как ${client.user.tag}`);
});

/* ───── INTERACTIONS ───── */

client.on(Events.InteractionCreate, async i => {

  if (i.isChatInputCommand()) {

    if (i.commandName === 'капт') {

      const id = Date.now().toString();

      events[id] = {
        type: 'capt',
        owner: i.user.id,
        title: i.options.getString('название'),
        date: i.options.getString('дата'),
        max: i.options.getInteger('колво'),
        users: [],
        messageId: null
      };

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`join_${id}`).setLabel('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`leave_${id}`).setLabel('🚪').setStyle(ButtonStyle.Secondary)
      );

      const msg = await i.reply({
        embeds: [createCapt(events[id])],
        components: [row],
        fetchReply: true
      });

      events[id].messageId = msg.id;
      save();
    }

    if (i.commandName === 'фамкапт') {

      const id = Date.now().toString();

      events[id] = {
        type: 'fam',
        owner: i.user.id,
        title: i.options.getString('название'),
        date: i.options.getString('дата'),
        max: i.options.getInteger('колво'),
        users: [],
        positions: {},
        threadId: null,
        messageId: null
      };

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fjoin_${id}`).setLabel('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`fpos_${id}`).setLabel('🎯').setStyle(ButtonStyle.Primary)
      );

      const msg = await i.reply({
        embeds: [createCapt(events[id])],
        components: [row],
        fetchReply: true
      });

      const thread = await msg.startThread({
        name: 'Фам капт',
        autoArchiveDuration: 60
      });

      events[id].messageId = msg.id;
      events[id].threadId = thread.id;

      await thread.send({ embeds: [createFam(events[id])] });

      save();
    }
  }

  /* ───── BUTTONS ───── */

  if (i.isButton()) {

    const [a, id] = i.customId.split('_');
    const e = events[id];
    if (!e) return;

    /* CAPT JOIN */
    if (a === 'join') {

      const m = new ModalBuilder()
        .setCustomId(`nick_${id}`)
        .setTitle('Ник');

      const input = new TextInputBuilder()
        .setCustomId('nick')
        .setLabel('Введите ник')
        .setStyle(TextInputStyle.Short);

      m.addComponents(new ActionRowBuilder().addComponents(input));

      return i.showModal(m);
    }

    if (a === 'leave') {

      e.users = e.users.filter(x => x.id !== i.user.id);
      save();

      const msg = await i.channel.messages.fetch(e.messageId);
      return msg.edit({ embeds: [createCapt(e)] });
    }

    /* FAM JOIN (ТОЛЬКО В СПИСОК) */
    if (a === 'fjoin') {

      const m = new ModalBuilder()
        .setCustomId(`fnick_${id}`)
        .setTitle('Ник');

      const input = new TextInputBuilder()
        .setCustomId('nick')
        .setLabel('Ваш ник')
        .setStyle(TextInputStyle.Short);

      m.addComponents(new ActionRowBuilder().addComponents(input));

      return i.showModal(m);
    }

    /* POSITION */
    if (a === 'fpos') {

      const m = new ModalBuilder()
        .setCustomId(`fpos_${id}`)
        .setTitle('Позиция');

      const input = new TextInputBuilder()
        .setCustomId('pos')
        .setLabel('Введите позицию')
        .setStyle(TextInputStyle.Short);

      m.addComponents(new ActionRowBuilder().addComponents(input));

      return i.showModal(m);
    }
  }

  /* ───── MODALS ───── */

  if (i.isModalSubmit()) {

    const [t, id] = i.customId.split('_');
    const e = events[id];
    if (!e) return;

    /* CAPT NICK */
    if (t === 'nick') {

      e.users.push({
        id: i.user.id,
        nick: i.fields.getTextInputValue('nick')
      });

      save();

      const msg = await i.channel.messages.fetch(e.messageId);
      return msg.edit({ embeds: [createCapt(e)] });
    }

    /* FAM NICK (ТОЛЬКО СПИСОК) */
    if (t === 'fnick') {

      if (!e.users.find(x => x.id === i.user.id)) {
        e.users.push({
          id: i.user.id,
          nick: i.fields.getTextInputValue('nick')
        });
      }

      save();

      const msg = await i.channel.messages.fetch(e.messageId);
      return msg.edit({ embeds: [createCapt(e)] });
    }

    /* POSITION → В ВЕТКУ */
    if (t === 'fpos') {

      const pos = parseInt(i.fields.getTextInputValue('pos'));

      if (isNaN(pos) || pos < 1 || pos > e.max)
        return i.reply({ content: 'Ошибка позиции', ephemeral: true });

      if (Object.values(e.positions).find(x => x.pos === pos))
        return i.reply({ content: 'Занято', ephemeral: true });

      e.positions[i.user.id] = {
        pos,
        nick: e.users.find(u => u.id === i.user.id)?.nick || 'no-nick'
      };

      save();

      const thread = await client.channels.fetch(e.threadId);
      await thread.send({ embeds: [createFam(e)] });

      return i.reply({ content: `Позиция ${pos} занята`, ephemeral: true });
    }
  }
});

/* ───── COMMANDS ───── */

const commands = [
  new SlashCommandBuilder()
    .setName('капт')
    .setDescription('капт')
    .addStringOption(o => o.setName('название').setRequired(true))
    .addStringOption(o => o.setName('дата').setRequired(true))
    .addIntegerOption(o => o.setName('колво').setRequired(true)),

  new SlashCommandBuilder()
    .setName('фамкапт')
    .setDescription('фам капт')
    .addStringOption(o => o.setName('название').setRequired(true))
    .addStringOption(o => o.setName('дата').setRequired(true))
    .addIntegerOption(o => o.setName('колво').setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
})();

client.login(TOKEN);
