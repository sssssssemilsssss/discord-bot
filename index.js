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

/* HELPERS */

const safeFetch = async (ch, id) => {
  try { return await ch.messages.fetch(id); } catch {}
};

const safeChannel = async (id) => {
  try { return await client.channels.fetch(id); } catch {}
};

/* EMBEDS */

function captEmbed(e) {
  const list = e.users.length
    ? e.users.map((u, i) => `**${i + 1}.** <@${u.id}> • \`${u.nick}\``).join('\n')
    : '😴 *Пусто...*';

  return new EmbedBuilder()
    .setColor(0x00ff99)
    .setDescription(
      `## 📌 ${e.title}\n\n` +
      `📅 **Дата:** ${e.date}\n` +
      `📊 **Статус:** ${e.closed ? '🔴 Закрыт' : '🟢 Открыт'}\n\n` +
      `👥 **Участники (${e.users.length}/${e.max})**\n\n${list}`
    );
}

function famEmbed(e) {
  let txt = '';

  for (let i = 1; i <= e.max; i++) {
    const uid = Object.keys(e.positions).find(x => e.positions[x].pos === i);

    txt += uid
      ? `🔴 **${i}** — <@${uid}> | \`${e.positions[uid].nick}\`\n`
      : `🟢 **${i}** — *свободно*\n`;
  }

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎯 Распределение позиций')
    .setDescription(txt);
}

/* READY */

client.once(Events.ClientReady, () => console.log('✅ BOT READY'));

/* INTERACTIONS */

client.on(Events.InteractionCreate, async (i) => {
  try {

    /* SLASH */

    if (i.isChatInputCommand()) {

      const id = Date.now().toString();

      /* КАПТ */

      if (i.commandName === 'капт') {

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
          new ButtonBuilder().setCustomId(`join_${id}`).setLabel('➕ Войти').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`leave_${id}`).setLabel('🚪 Выйти').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`close_${id}`).setLabel('🔒 Закрыть').setStyle(ButtonStyle.Primary)
        );

        const msg = await i.reply({
          embeds: [captEmbed(data[id])],
          components: [row],
          fetchReply: true
        });

        data[id].messageId = msg.id;
        save();
      }

      /* ФАМ КАПТ */

      if (i.commandName === 'фамкапт') {

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
          new ButtonBuilder().setCustomId(`join_${id}`).setLabel('➕ Войти').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`leave_${id}`).setLabel('🚪 Выйти').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`close_${id}`).setLabel('🔒 Закрыть').setStyle(ButtonStyle.Primary)
        );

        const msg = await i.reply({
          embeds: [captEmbed(data[id])],
          components: [row],
          fetchReply: true
        });

        const thread = await msg.startThread({
          name: '🎯 позиции',
          type: 12
        });

        const tmsg = await thread.send({
          embeds: [famEmbed(data[id])],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`pos_${id}`).setLabel('🎯 Выбрать позицию').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`leave_${id}`).setLabel('🚪 Выйти').setStyle(ButtonStyle.Secondary)
            )
          ]
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

      if (a === 'join') {

        if (e.closed)
          return i.reply({ content: '🔒 Капт закрыт', ephemeral: true });

        const modal = new ModalBuilder()
          .setCustomId(`nick_${id}`)
          .setTitle('📝 Ввод ника');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('nick')
              .setLabel('Введите ник')
              .setStyle(TextInputStyle.Short)
          )
        );

        return i.showModal(modal);
      }

      if (a === 'leave') {

        e.users = e.users.filter(u => u.id !== i.user.id);
        delete e.positions?.[i.user.id];

        save();

        const msg = await safeFetch(i.channel, e.messageId);
        if (msg) await msg.edit({ embeds: [captEmbed(e)] });

        if (e.threadId) {
          const thread = await safeChannel(e.threadId);
          const tmsg = await thread?.messages.fetch(e.threadMsgId);
          if (tmsg) await tmsg.edit({ embeds: [famEmbed(e)] });
        }

        return i.reply({ content: '🚪 Ты вышел', ephemeral: true });
      }

      if (a === 'close') {
        e.closed = !e.closed;
        save();

        const msg = await safeFetch(i.channel, e.messageId);
        if (msg) await msg.edit({ embeds: [captEmbed(e)] });

        return i.reply({ content: '🔄 Обновлено', ephemeral: true });
      }

      if (a === 'pos') {

        const modal = new ModalBuilder()
          .setCustomId(`pos_${id}`)
          .setTitle('🎯 Выбор позиции');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('pos')
              .setLabel('Только цифра (например: 3)')
              .setStyle(TextInputStyle.Short)
          )
        );

        return i.showModal(modal);
      }
    }

    /* MODALS */

    if (i.isModalSubmit()) {

      const [t, id] = i.customId.split('_');
      const e = data[id];
      if (!e) return;

      if (t === 'nick') {

        const nick = i.fields.getTextInputValue('nick');

        const existing = e.users.find(u => u.id === i.user.id);

        if (existing) {
          existing.nick = nick; // фикс undefined
        } else {
          e.users.push({ id: i.user.id, nick });
        }

        if (e.threadId) {
          const thread = await safeChannel(e.threadId);
          await thread.members.add(i.user.id).catch(() => {});
        }

        save();

        const msg = await safeFetch(i.channel, e.messageId);
        if (msg) await msg.edit({ embeds: [captEmbed(e)] });

        return i.reply({ content: '✅ Добавлен', ephemeral: true });
      }

      if (t === 'pos') {

        const input = i.fields.getTextInputValue('pos');

        if (!/^\d+$/.test(input))
          return i.reply({ content: '❌ Только цифры!', ephemeral: true });

        const pos = parseInt(input);

        if (pos < 1 || pos > e.max)
          return i.reply({ content: '❌ Вне диапазона', ephemeral: true });

        if (e.positions[i.user.id])
          return i.reply({ content: '❌ У тебя уже есть позиция', ephemeral: true });

        if (Object.values(e.positions).find(x => x.pos === pos))
          return i.reply({ content: '❌ Занято', ephemeral: true });

        const user = e.users.find(u => u.id === i.user.id);

        e.positions[i.user.id] = {
          pos,
          nick: user ? user.nick : 'no-nick'
        };

        save();

        const thread = await safeChannel(e.threadId);
        const tmsg = await thread.messages.fetch(e.threadMsgId);

        await tmsg.edit({ embeds: [famEmbed(e)] });

        return i.reply({ content: `✅ Позиция ${pos} занята`, ephemeral: true });
      }
    }

  } catch (err) {
    console.log(err);
  }
});

/* COMMANDS */

const commands = [
  new SlashCommandBuilder()
    .setName('капт')
    .setDescription('создать капт')
    .addStringOption(o => o.setName('название').setDescription('название').setRequired(true))
    .addStringOption(o => o.setName('дата').setDescription('дата').setRequired(true))
    .addIntegerOption(o => o.setName('колво').setDescription('колво').setRequired(true)),

  new SlashCommandBuilder()
    .setName('фамкапт')
    .setDescription('создать фам капт')
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
