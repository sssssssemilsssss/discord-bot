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

/* ───── ENV SAFETY ───── */

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
  const list = e.users?.length
    ? e.users.map((u, i) => `${i + 1}. <@${u.id}> • ${u.nick}`).join('\n')
    : 'Пока никого нет';

  return new EmbedBuilder()
    .setColor(0x00ff00)
    .setDescription(
      `# ${e.title}\n\n` +
      `**Создал:** <@${e.owner}>\n` +
      `**Дата:** ${e.date}\n\n` +
      `**Участники (${e.users.length}/${e.max})**\n\n` +
      list
    );
}

function famEmbed(e) {
  let text = '';

  for (let i = 1; i <= e.max; i++) {
    const uid = Object.keys(e.positions || {})
      .find(id => e.positions[id].pos === i);

    if (!uid) text += `🟢 ${i} — свободно\n`;
    else {
      const u = e.positions[uid];
      text += `🔴 ${i} — <@${uid}> | ${u.nick}\n`;
    }
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

        data[id].messageId = msg.id;
        data[id].threadId = thread.id;

        await thread.send({ embeds: [famEmbed(data[id])] });

        save();
      }
    }

    /* ───── BUTTONS ───── */
    if (i.isButton()) {

      const [a, id] = i.customId.split('_');
      const e = data[id];
      if (!e) return;

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
        e.users = e.users.filter(u => u.id !== i.user.id);
        save();

        const msg = await safeFetch(i.channel, e.messageId);
        return safeEdit(msg, { embeds: [captEmbed(e)] });
      }

      if (a === 'fjoin') {

        const m = new ModalBuilder()
          .setCustomId(`fnick_${id}`)
          .setTitle('Ник');

        const input = new TextInputBuilder()
          .setCustomId('nick')
          .setLabel('Введите ник')
          .setStyle(TextInputStyle.Short);

        m.addComponents(new ActionRowBuilder().addComponents(input));

        return i.showModal(m);
      }

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
      const e = data[id];
      if (!e) return;

      if (t === 'nick') {

        e.users.push({
          id: i.user.id,
          nick: i.fields.getTextInputValue('nick')
        });

        save();

        const msg = await safeFetch(i.channel, e.messageId);
        return safeEdit(msg, { embeds: [captEmbed(e)] });
      }

      if (t === 'fnick') {

        if (!e.users.find(x => x.id === i.user.id)) {
          e.users.push({
            id: i.user.id,
            nick: i.fields.getTextInputValue('nick')
          });
        }

        save();

        const msg = await safeFetch(i.channel, e.messageId);
        return safeEdit(msg, { embeds: [captEmbed(e)] });
      }

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

        const thread = await safeChannel(e.threadId);
        await thread?.send({ embeds: [famEmbed(e)] });

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

client.login(TOKEN).catch(err => {
  console.log("LOGIN ERROR:", err);
});
