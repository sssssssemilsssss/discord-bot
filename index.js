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

/* ───── CONFIG ───── */

const TOKEN = process.env.TOKEN;
const CLIENT_ID = '1438878652250198069';
const GUILD_ID = '1073591307487948833';

if (!TOKEN) {
  console.log("❌ TOKEN NOT FOUND");
  process.exit(1);
}

/* ───── CLIENT ───── */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ───── DATA ───── */

let data = {};
if (fs.existsSync('data.json')) {
  try {
    data = JSON.parse(fs.readFileSync('data.json'));
  } catch {
    data = {};
  }
}

const save = () =>
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));

/* ───── HELPERS ───── */

async function safeFetch(channel, id) {
  try {
    return await channel.messages.fetch(id);
  } catch {
    return null;
  }
}

async function safeChannel(id) {
  try {
    return await client.channels.fetch(id);
  } catch {
    return null;
  }
}

/* ───── EMBEDS ───── */

function captEmbed(e) {
  const users = e.users || [];

  const list = users.length
    ? users.map((u, i) => `${i + 1}. <@${u.id}> • ${u.nick}`).join('\n')
    : 'Пусто';

  return new EmbedBuilder()
    .setColor(0x00ff00)
    .setDescription(
      `# ${e.title}\n\n` +
      `**Создал:** <@${e.owner}>\n` +
      `**Дата:** ${e.date}\n` +
      `**Статус:** ${e.closed ? "🔴 Закрыт" : "🟢 Открыт"}\n\n` +
      `**Участники (${users.length}/${e.max})**\n\n` +
      list
    );
}

function famEmbed(e) {
  const pos = e.positions || {};

  let text = '';
  for (let i = 1; i <= e.max; i++) {
    const uid = Object.keys(pos).find(id => pos[id].pos === i);
    text += uid
      ? `🔴 ${i} — <@${uid}> | ${pos[uid].nick}\n`
      : `🟢 ${i} — свободно\n`;
  }

  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle("Фам капт")
    .setDescription(text);
}

/* ───── READY ───── */

client.once(Events.ClientReady, () => {
  console.log(`✅ Logged as ${client.user.tag}`);
});

/* ───── INTERACTIONS ───── */

client.on(Events.InteractionCreate, async (i) => {
  try {

    /* ───── SLASH ───── */

    if (i.isChatInputCommand()) {

      /* CAPT (NO THREAD) */
      if (i.commandName === 'капт') {

        const id = Date.now().toString();

        data[id] = {
          type: 'capt',
          owner: i.user.id,
          title: i.options.getString('название'),
          date: i.options.getString('дата'),
          max: i.options.getInteger('колво'),
          users: [],
          closed: false,
          messageId: null
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

      /* FAM CAPT (WITH THREAD) */
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
          closed: false,
          messageId: null,
          threadId: null,
          threadMsgId: null
        };

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fjoin_${id}`).setLabel('➕').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`remove_${id}`).setLabel('❌').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`close_${id}`).setLabel('🔒').setStyle(ButtonStyle.Primary)
        );

        const msg = await i.reply({
          embeds: [captEmbed(data[id])],
          components: [row],
          fetchReply: true
        });

        const thread = await msg.startThread({
          name: "фам капт",
          autoArchiveDuration: 60
        });

        const tmsg = await thread.send({
          embeds: [famEmbed(data[id])],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`fpos_${id}`)
                .setLabel('🎯 позиция')
                .setStyle(ButtonStyle.Primary)
            )
          ]
        });

        data[id].messageId = msg.id;
        data[id].threadId = thread.id;
        data[id].threadMsgId = tmsg.id;

        save();
      }
    }

    /* ───── BUTTONS ───── */

    if (i.isButton()) {

      const [a, id] = i.customId.split('_');
      const e = data[id];
      if (!e) return;

      const isOwner = i.user.id === e.owner;

      /* JOIN */
      if (a === 'join' || a === 'fjoin') {

        if (e.closed)
          return i.reply({ content: 'Закрыто', ephemeral: true });

        const modal = new ModalBuilder()
          .setCustomId(`nick_${id}`)
          .setTitle('Ник');

        const input = new TextInputBuilder()
          .setCustomId('nick')
          .setLabel('Введите ник')
          .setStyle(TextInputStyle.Short);

        modal.addComponents(new ActionRowBuilder().addComponents(input));

        return i.showModal(modal);
      }

      /* REMOVE */
      if (a === 'remove') {
        if (!isOwner)
          return i.reply({ content: 'Нет прав', ephemeral: true });

        const modal = new ModalBuilder()
          .setCustomId(`remove_${id}`)
          .setTitle('Удалить по номеру');

        const input = new TextInputBuilder()
          .setCustomId('num')
          .setLabel('Номер участника')
          .setStyle(TextInputStyle.Short);

        modal.addComponents(new ActionRowBuilder().addComponents(input));

        return i.showModal(modal);
      }

      /* CLOSE */
      if (a === 'close') {
        if (!isOwner)
          return i.reply({ content: 'Нет прав', ephemeral: true });

        e.closed = !e.closed;
        save();

        const msg = await safeFetch(i.channel, e.messageId);
        if (msg) await msg.edit({ embeds: [captEmbed(e)] });

        return i.reply({ content: 'Статус изменён', ephemeral: true });
      }

      /* FPOS ONLY IN THREAD */
      if (a === 'fpos') {

        const modal = new ModalBuilder()
          .setCustomId(`fpos_${id}`)
          .setTitle('Позиция');

        const input = new TextInputBuilder()
          .setCustomId('pos')
          .setLabel('Введите позицию')
          .setStyle(TextInputStyle.Short);

        modal.addComponents(new ActionRowBuilder().addComponents(input));

        return i.showModal(modal);
      }
    }

    /* ───── MODALS ───── */

    if (i.isModalSubmit()) {

      const [t, id] = i.customId.split('_');
      const e = data[id];
      if (!e) return i.reply({ content: 'Нет данных', ephemeral: true });

      /* JOIN */
      if (t === 'nick') {

        const nick = i.fields.getTextInputValue('nick');

        if (e.users.find(u => u.id === i.user.id))
          return i.reply({ content: 'Ты уже в списке', ephemeral: true });

        e.users.push({ id: i.user.id, nick });
        save();

        const msg = await safeFetch(i.channel, e.messageId);
        if (msg) await msg.edit({ embeds: [captEmbed(e)] });

        return i.reply({ content: 'Добавлен', ephemeral: true });
      }

      /* REMOVE */
      if (t === 'remove') {

        const num = parseInt(i.fields.getTextInputValue('num'));
        const user = e.users[num - 1];

        if (!user)
          return i.reply({ content: 'Нет такого', ephemeral: true });

        delete e.positions?.[user.id]; // анти-чит очистка позиции
        e.users.splice(num - 1, 1);

        save();

        const msg = await safeFetch(i.channel, e.messageId);
        if (msg) await msg.edit({ embeds: [captEmbed(e)] });

        const thread = await safeChannel(e.threadId);
        const tmsg = await thread?.messages.fetch(e.threadMsgId);

        if (tmsg) await tmsg.edit({ embeds: [famEmbed(e)] });

        return i.reply({ content: 'Удалён', ephemeral: true });
      }

      /* FPOS ANTI-CHEAT */
      if (t === 'fpos') {

        const pos = parseInt(i.fields.getTextInputValue('pos'));

        if (isNaN(pos) || pos < 1 || pos > e.max)
          return i.reply({ content: 'Ошибка позиции', ephemeral: true });

        const alreadyHasPos = Object.values(e.positions || {})
          .find(x => x.id === i.user.id);

        if (alreadyHasPos)
          return i.reply({ content: 'Ты уже занял позицию', ephemeral: true });

        if (Object.values(e.positions || {})
          .find(x => x.pos === pos))
          return i.reply({ content: 'Позиция занята', ephemeral: true });

        e.positions[i.user.id] = {
          pos,
          nick: e.users.find(u => u.id === i.user.id)?.nick || 'no-nick',
          id: i.user.id
        };

        save();

        const thread = await safeChannel(e.threadId);
        const tmsg = await thread?.messages.fetch(e.threadMsgId);

        if (tmsg) await tmsg.edit({ embeds: [famEmbed(e)] });

        return i.reply({ content: `Позиция ${pos} занята`, ephemeral: true });
      }
    }

  } catch (err) {
    console.log("ERROR:", err);
  }
});

/* ───── COMMANDS ───── */

const commands = [
  new SlashCommandBuilder()
    .setName('капт')
    .setDescription('капт')
    .addStringOption(o =>
      o.setName('название').setDescription('название').setRequired(true))
    .addStringOption(o =>
      o.setName('дата').setDescription('дата').setRequired(true))
    .addIntegerOption(o =>
      o.setName('колво').setDescription('колво').setRequired(true)),

  new SlashCommandBuilder()
    .setName('фамкапт')
    .setDescription('фам капт')
    .addStringOption(o =>
      o.setName('название').setDescription('название').setRequired(true))
    .addStringOption(o =>
      o.setName('дата').setDescription('дата').setRequired(true))
    .addIntegerOption(o =>
      o.setName('колво').setDescription('колво').setRequired(true))
];

/* ───── REGISTER ───── */

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
})();

/* ───── LOGIN ───── */

client.login(TOKEN);
