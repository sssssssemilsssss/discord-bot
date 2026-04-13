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

/* ───── ДАННЫЕ ───── */

let eventsData = {};
if (fs.existsSync('data.json')) {
  eventsData = JSON.parse(fs.readFileSync('data.json'));
}

function save() {
  fs.writeFileSync('data.json', JSON.stringify(eventsData, null, 2));
}

/* ───── КАРТИНКИ ───── */

const images = [
  'https://i.imgur.com/XVaHFVH.jpeg',
  'https://i.imgur.com/gTlqFJh.png',
  'https://i.imgur.com/f1zyGkj.png',
  'https://i.imgur.com/pyNF0UG.png',
  'https://i.imgur.com/2ejrfV6.png'
];

function getRandomImage() {
  return images[Math.floor(Math.random() * images.length)];
}

/* ───── EMBEDЫ ───── */

function createEmbed(event) {
  const list = event.users
    .map((u, i) =>
      `${i === 0 ? '👑' : '▫️'} ${i + 1}. <@${u.id}> • ${u.nick}`
    )
    .join('\n');

  return new EmbedBuilder()
    .setColor(0x00ff00)
    .setDescription(
      `# ${event.title}\n\n` +
      `**Создал:** <@${event.owner}>\n` +
      `**Дата:** ${event.date}\n\n` +
      `**Участники (${event.users.length}/${event.max})**\n\n` +
      `${list || 'Пока никого нет'}`
    )
    .setImage(getRandomImage())
    .setTimestamp();
}

function createFamEmbed(event) {

  let list = '';

  for (let i = 1; i <= event.max; i++) {

    const userId = Object.keys(event.positions)
      .find(id => event.positions[id] === i);

    if (userId) {
      list += `🔴 ${i} — <@${userId}>\n`;
    } else {
      list += `🟢 ${i} — свободно\n`;
    }
  }

  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(`Фам капт (${Object.keys(event.positions).length}/${event.max})`)
    .setDescription(list)
    .setImage(getRandomImage())
    .setTimestamp();
}

/* ───── READY ───── */

client.once(Events.ClientReady, () => {
  console.log(`Бот запущен как ${client.user.tag}`);
});

/* ───── INTERACTIONS ───── */

client.on(Events.InteractionCreate, async interaction => {

  /* КОМАНДЫ */
  if (interaction.isChatInputCommand()) {

    /* ───── /капт ───── */

    if (interaction.commandName === 'капт') {

      const title = interaction.options.getString('название');
      const date = interaction.options.getString('дата');
      const max = interaction.options.getInteger('колво');

      const id = Date.now().toString();

      eventsData[id] = {
        owner: interaction.user.id,
        title,
        date,
        max,
        users: [],
        closed: false,
        messageId: null
      };

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`join_${id}`)
          .setLabel('➕ Присоединиться')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`leave_${id}`)
          .setLabel('🚪 Выйти')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ content: '@everyone' });

      const msg = await interaction.followUp({
        embeds: [createEmbed(eventsData[id])],
        components: [row],
        fetchReply: true
      });

      eventsData[id].messageId = msg.id;
      save();
    }

    /* ───── /фамкапт ───── */

    if (interaction.commandName === 'фамкапт') {

      const max = interaction.options.getInteger('слоты');
      const id = Date.now().toString();

      eventsData[id] = {
        owner: interaction.user.id,
        max,
        positions: {},
        threadId: null,
        messageId: null
      };

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`fjoin_${id}`)
          .setLabel('➕')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`fleave_${id}`)
          .setLabel('🚪')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`fclear_${id}`)
          .setLabel('❌ Позиция')
          .setStyle(ButtonStyle.Danger)
      );

      const msg = await interaction.reply({
        embeds: [createFamEmbed(eventsData[id])],
        components: [row],
        fetchReply: true
      });

      const thread = await msg.startThread({
        name: `Фам капт`,
        autoArchiveDuration: 60
      });

      eventsData[id].threadId = thread.id;
      eventsData[id].messageId = msg.id;

      save();
    }
  }

  /* ───── КНОПКИ ───── */

  if (interaction.isButton()) {

    const [action, id] = interaction.customId.split('_');
    const event = eventsData[id];
    if (!event) return;

    const channel = interaction.channel;

    /* ───── ОБЫЧНЫЙ КАПТ ───── */

    if (action === 'join') {
      if (event.users.find(u => u.id === interaction.user.id))
        return interaction.reply({ content: 'Ты уже в списке', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`modal_${id}`)
        .setTitle('Введите ник');

      const input = new TextInputBuilder()
        .setCustomId('nick')
        .setLabel('Ваш ник')
        .setStyle(TextInputStyle.Short);

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      return interaction.showModal(modal);
    }

    if (action === 'leave') {
      event.users = event.users.filter(u => u.id !== interaction.user.id);
      save();

      const msg = await channel.messages.fetch(event.messageId);
      await msg.edit({ embeds: [createEmbed(event)] });

      return interaction.reply({ content: 'Ты вышел', ephemeral: true });
    }

    /* ───── ФАМ КАПТ ───── */

    if (action === 'fjoin') {

      const thread = await client.channels.fetch(event.threadId);
      await thread.members.add(interaction.user.id);

      return interaction.reply({ content: 'Ты в ветке', ephemeral: true });
    }

    if (action === 'fleave') {

      const thread = await client.channels.fetch(event.threadId);
      await thread.members.remove(interaction.user.id);

      delete event.positions[interaction.user.id];
      save();

      const msg = await channel.messages.fetch(event.messageId);
      await msg.edit({ embeds: [createFamEmbed(event)] });

      return interaction.reply({ content: 'Ты вышел', ephemeral: true });
    }

    if (action === 'fclear') {

      delete event.positions[interaction.user.id];
      save();

      const msg = await channel.messages.fetch(event.messageId);
      await msg.edit({ embeds: [createFamEmbed(event)] });

      return interaction.reply({ content: 'Позиция очищена', ephemeral: true });
    }
  }

  /* ───── МОДАЛКА ───── */

  if (interaction.isModalSubmit()) {

    const id = interaction.customId.split('_')[1];
    const event = eventsData[id];

    event.users.push({
      id: interaction.user.id,
      nick: interaction.fields.getTextInputValue('nick')
    });

    save();

    const msg = await interaction.channel.messages.fetch(event.messageId);
    await msg.edit({ embeds: [createEmbed(event)] });

    return interaction.reply({ content: 'Ты добавлен', ephemeral: true });
  }
});

/* ───── СООБЩЕНИЯ (ПОЗИЦИИ) ───── */

client.on('messageCreate', async message => {

  if (!message.channel.isThread()) return;

  const event = Object.values(eventsData)
    .find(e => e.threadId === message.channel.id);

  if (!event) return;

  const num = parseInt(message.content);
  if (isNaN(num)) return;

  if (num < 1 || num > event.max)
    return message.reply('Неверная позиция');

  if (Object.values(event.positions).includes(num))
    return message.reply('Позиция занята');

  event.positions[message.author.id] = num;
  save();

  const parent = await message.channel.parent.messages.fetch(event.messageId);
  await parent.edit({ embeds: [createFamEmbed(event)] });

  message.reply(`Ты занял позицию ${num}`);
});

/* ───── РЕГИСТРАЦИЯ КОМАНД ───── */

const commands = [
  new SlashCommandBuilder()
    .setName('капт')
    .setDescription('Создать капт')
    .addStringOption(o => o.setName('название').setDescription('Название').setRequired(true))
    .addStringOption(o => o.setName('дата').setDescription('Дата').setRequired(true))
    .addIntegerOption(o => o.setName('колво').setDescription('Количество').setRequired(true)),

  new SlashCommandBuilder()
    .setName('фамкапт')
    .setDescription('Фам капт')
    .addIntegerOption(o => o.setName('слоты').setDescription('Слоты').setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
})();

client.login(TOKEN);
