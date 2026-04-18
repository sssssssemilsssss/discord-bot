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

let data = {};
if (fs.existsSync('data.json')) {
  try { data = JSON.parse(fs.readFileSync('data.json')); } catch {}
}
const save = () => fs.writeFileSync('data.json', JSON.stringify(data, null, 2));

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
  return new EmbedBuilder().setTitle('Фам капт').setDescription(txt);
}

/* READY */

client.once(Events.ClientReady, () => console.log('READY'));

/* INTERACTIONS */

client.on(Events.InteractionCreate, async (i) => {
  try {

    /* SLASH */

    if (i.isChatInputCommand()) {

      if (i.commandName === 'фамкапт') {

        const id = Date.now().toString();

        data[id] = {
          owner: i.user.id,
          title: i.options.getString('название'),
          date: i.options.getString('дата'),
          max: i.options.getInteger('колво'),
          users: [],
          positions: {},
          closed: false
        };

        const mainRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`join_${id}`).setLabel('➕').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`leave_${id}`).setLabel('🚪').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`remove_${id}`).setLabel('❌').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`close_${id}`).setLabel('🔒').setStyle(ButtonStyle.Primary)
        );

        const msg = await i.reply({
          embeds: [captEmbed(data[id])],
          components: [mainRow],
          fetchReply: true
        });

        const thread = await msg.startThread({
          name: 'фам капт',
          type: 12
        });

        const threadRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`pos_${id}`).setLabel('🎯 позиция').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`leave_${id}`).setLabel('🚪 выйти').setStyle(ButtonStyle.Secondary)
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

    /* BUTTONS */

    if (i.isButton()) {

      const [a, id] = i.customId.split('_');
      const e = data[id];
      if (!e) return;

      const isOwner = i.user.id === e.owner;

      /* JOIN */

      if (a === 'join') {

        if (e.closed)
          return i.reply({ content: 'Закрыто', ephemeral: true });

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

      /* LEAVE (ГЛОБАЛЬНЫЙ) */

      if (a === 'leave') {

        e.users = e.users.filter(u => u.id !== i.user.id);
        delete e.positions[i.user.id];

        save();

        const msg = await safeFetch(i.channel, e.messageId);
        if (msg) await msg.edit({ embeds: [captEmbed(e)] });

        const thread = await safeChannel(e.threadId);
        const tmsg = await thread?.messages.fetch(e.threadMsgId);
        if (tmsg) await tmsg.edit({ embeds: [famEmbed(e)] });

        return i.reply({ content: 'Ты вышел', ephemeral: true });
      }

      /* REMOVE */

      if (a === 'remove') {
        if (!isOwner)
          return i.reply({ content: 'Нет прав', ephemeral: true });

        const m = new ModalBuilder()
          .setCustomId(`remove_${id}`)
          .setTitle('Удалить');

        const input = new TextInputBuilder()
          .setCustomId('num')
          .setLabel('Номер')
          .setStyle(TextInputStyle.Short);

        m.addComponents(new ActionRowBuilder().addComponents(input));
        return i.showModal(m);
      }

      /* CLOSE */

      if (a === 'close') {
        if (!isOwner)
          return i.reply({ content: 'Нет прав', ephemeral: true });

        e.closed = !e.closed;
        save();

        const msg = await safeFetch(i.channel, e.messageId);
        if (msg) await msg.edit({ embeds: [captEmbed(e)] });

        return i.reply({ content: 'Обновлено', ephemeral: true });
      }

      /* POSITION */

      if (a === 'pos') {

        const m = new ModalBuilder()
          .setCustomId(`pos_${id}`)
          .setTitle('Позиция');

        const input = new TextInputBuilder()
          .setCustomId('pos')
          .setLabel('Введите позицию')
          .setStyle(TextInputStyle.Short);

        m.addComponents(new ActionRowBuilder().addComponents(input));
        return i.showModal(m);
      }
    }

    /* MODALS */

    if (i.isModalSubmit()) {

      const [t, id] = i.customId.split('_');
      const e = data[id];
      if (!e) return;

      /* JOIN */

      if (t === 'nick') {

        const nick = i.fields.getTextInputValue('nick');

        if (e.users.find(u => u.id === i.user.id))
          return i.reply({ content: 'Ты уже в списке', ephemeral: true });

        e.users.push({ id: i.user.id, nick });

        const thread = await safeChannel(e.threadId);
        await thread.members.add(i.user.id).catch(() => {});

        save();

        const msg = await safeFetch(i.channel, e.messageId);
        if (msg) await msg.edit({ embeds: [captEmbed(e)] });

        return i.reply({ content: 'Ты добавлен', ephemeral: true });
      }

      /* REMOVE */

      if (t === 'remove') {

        const num = parseInt(i.fields.getTextInputValue('num'));
        const user = e.users[num - 1];
        if (!user) return i.reply({ content: 'Ошибка', ephemeral: true });

        delete e.positions[user.id];
        e.users.splice(num - 1, 1);

        save();

        const msg = await safeFetch(i.channel, e.messageId);
        if (msg) await msg.edit({ embeds: [captEmbed(e)] });

        return i.reply({ content: 'Удалён', ephemeral: true });
      }

      /* POSITION */

      if (t === 'pos') {

        const pos = parseInt(i.fields.getTextInputValue('pos'));

        if (isNaN(pos) || pos < 1 || pos > e.max)
          return i.reply({ content: 'Ошибка', ephemeral: true });

        if (e.positions[i.user.id])
          return i.reply({ content: 'У тебя уже есть позиция', ephemeral: true });

        if (Object.values(e.positions).find(x => x.pos === pos))
          return i.reply({ content: 'Занято', ephemeral: true });

        e.positions[i.user.id] = {
          pos,
          nick: e.users.find(u => u.id === i.user.id)?.nick
        };

        save();

        const thread = await safeChannel(e.threadId);
        const tmsg = await thread.messages.fetch(e.threadMsgId);

        await tmsg.edit({ embeds: [famEmbed(e)] });

        return i.reply({ content: 'Позиция занята', ephemeral: true });
      }
    }

  } catch (e) {
    console.log(e);
  }
});

/* COMMANDS */

const commands = [
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
