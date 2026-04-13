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

/* ───── ENV ───── */

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

function save() {
  try {
    fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
  } catch {}
}

/* ───── SAFE HELPERS ───── */

async function safeFetch(channel, id) {
  try {
    return await channel.messages.fetch(id);
  } catch {
    return null;
  }
}

async function safeEdit(msg, payload) {
  try {
    if (!msg) return;
    await msg.edit(payload);
  } catch {}
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
    : 'Пока никого нет';

  return new EmbedBuilder()
    .setColor(0x00ff00)
    .setDescription(
      `# ${e.title}\n\n` +
      `**Создал:** <@${e.owner}>\n` +
      `**Дата:** ${e.date}\n\n` +
      `**Участники (${users.length}/${e.max})**\n\n` +
      list
    );
}

function famEmbed(e) {
  const max = e.max || 0;
  const pos = e.positions || {};

  let text = '';

  for (let i = 1; i <= max; i++) {
    const uid = Object.keys(pos).find(id => pos[id].pos === i);

    if (!uid) text += `🟢 ${i} — свободно\n`;
    else {
      text += `🔴 ${i} — <@${uid}> | ${pos[uid].nick}\n`;
    }
  }

  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle("Фам капт")
    .setDescription(text || 'Пусто');
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

      if (i.commandName === 'капт') {
        const id = Date.now().toString();

        data[id] = {
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
          embeds: [captEmbed(data[id])],
          components: [row],
          fetchReply: true
        });

        data[id].messageId = msg.id;
        save();
      }

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
          threadId: null,
          threadMsgId: null,
          messageId: null
        };

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`fjoin_${id}`).setLabel('➕').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`fpos_${id}`).setLabel('🎯').setStyle(ButtonStyle.Primary)
        );

        const msg = await i.reply({
          embeds: [captEmbed(data[id])],
          components: [row],
          fetchReply: true
        });

        const thread = await msg.startThread({
          name: "Фам капт",
          autoArchiveDuration: 60
        });

        const tmsg = await thread.send({
          embeds: [famEmbed(data[id])]
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

      if (a === 'join' || a === 'fjoin') {

        const modal = new ModalBuilder()
          .setCustomId(`${a === 'join' ? 'nick' : 'fnick'}_${id}`)
          .setTitle('Ник');

        const input = new TextInputBuilder()
          .setCustomId('nick')
          .setLabel('Введите ник')
          .setStyle(TextInputStyle.Short);

        modal.addComponents(new ActionRowBuilder().addComponents(input));

        return i.showModal(modal);
      }

      if (a === 'leave') {
        e.users = e.users.filter(u => u.id !== i.user.id);
        save();

        const msg = await safeFetch(i.channel, e.messageId);
        await safeEdit(msg, { embeds: [captEmbed(e)] });

        return i.deferUpdate();
      }

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

      /* ── CAPT JOIN ── */
      if (t === 'nick') {

        e.users.push({
          id: i.user.id,
          nick: i.fields.getTextInputValue('nick')
        });

        save();

        const msg = await safeFetch(i.channel, e.messageId);
        await safeEdit(msg, { embeds: [captEmbed(e)] });

        return i.reply({ content: 'Ты добавлен', ephemeral: true });
      }

      /* ── FAM JOIN ── */
      if (t === 'fnick') {

        if (!e.users.find(x => x.id === i.user.id)) {
          e.users.push({
            id: i.user.id,
            nick: i.fields.getTextInputValue('nick')
          });
        }

        save();

        const msg = await safeFetch(i.channel, e.messageId);
        await safeEdit(msg, { embeds: [captEmbed(e)] });

        return i.reply({ content: 'Ты добавлен', ephemeral: true });
      }

      /* ── POSITION ── */
      if (t === 'fpos') {

        const pos = parseInt(i.fields.getTextInputValue('pos'));

        if (isNaN(pos) || pos < 1 || pos > e.max)
          return i.reply({ content: 'Ошибка позиции', ephemeral: true });

        if (Object.values(e.positions || {}).find(x => x.pos === pos))
          return i.reply({ content: 'Уже занято', ephemeral: true });

        e.positions[i.user.id] = {
          pos,
          nick: e.users.find(u => u.id === i.user.id)?.nick || 'no-nick'
        };

        save();

        const thread = await safeChannel(e.threadId);

        const msg = await thread?.messages.fetch(e.threadMsgId).catch(() => null);

        if (msg) {
          await msg.edit({ embeds: [famEmbed(e)] });
        }

        return i.reply({
          content: `Позиция ${pos} занята`,
          ephemeral: true
        });
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

/* ───── REGISTER ───── */

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
  } catch (e) {
    console.log("CMD ERROR:", e);
  }
})();

/* ───── LOGIN ───── */

client.login(TOKEN).catch(console.error);
