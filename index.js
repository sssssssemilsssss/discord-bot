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
const ROLE_ID = '1266795778429681746';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let eventsData = {};

// загрузка
if (fs.existsSync('data.json')) {
  eventsData = JSON.parse(fs.readFileSync('data.json'));
}

// сохранение
function save() {
  fs.writeFileSync('data.json', JSON.stringify(eventsData, null, 2));
}

// embed
function createEmbed(event) {
  let list = event.users
    .map((u, i) => `${i === 0 ? '👑' : '▫️'} <@${u.id}> | ${u.nick}`)
    .join('\n');

  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setDescription(
      `**Создал:** <@${event.owner}>\n` +
      `**Дата:** ${event.date}\n` +
      `**Лимит:** ${event.max}\n\n` +
      `**Участники (${event.users.length}/${event.max})**\n\n` +
      `${list || 'Пока никого нет'}`
    );
}

client.once('clientReady', () => {
  console.log('Бот запущен');
});

client.on(Events.InteractionCreate, async interaction => {

  // команда
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'капт') {

      const date = interaction.options.getString('дата');
      const max = interaction.options.getInteger('колво');

      const id = Date.now();

      eventsData[id] = {
        owner: interaction.user.id,
        date,
        max,
        users: [],
        closed: false
      };

      save();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`join_${id}`)
          .setLabel('Присоединиться')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`leave_${id}`)
          .setLabel('Убрать')
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId(`edit_${id}`)
          .setLabel('Изменить')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`close_${id}`)
          .setLabel('Закрыть')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content: `<@&${ROLE_ID}>`,
        embeds: [createEmbed(eventsData[id])],
        components: [row]
      });
    }
  }

  // кнопки
  if (interaction.isButton()) {
    const [action, id] = interaction.customId.split('_');
    const event = eventsData[id];
    if (!event) return;

    // JOIN
    if (action === 'join') {

      if (event.closed)
        return interaction.reply({ content: 'Набор закрыт', ephemeral: true });

      if (event.users.find(u => u.id === interaction.user.id))
        return interaction.reply({ content: 'Ты уже в списке', ephemeral: true });

      if (event.users.length >= event.max)
        return interaction.reply({ content: 'Мест нет', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`modal_${id}`)
        .setTitle('Введите ник');

      const input = new TextInputBuilder()
        .setCustomId('nick')
        .setLabel('Ваш ник')
        .setStyle(TextInputStyle.Short);

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      await interaction.showModal(modal);
    }

    // LEAVE
    if (action === 'leave') {
      event.users = event.users.filter(u => u.id !== interaction.user.id);
      save();

      await interaction.update({
        embeds: [createEmbed(event)]
      });
    }

    // CLOSE
    if (action === 'close') {
      if (interaction.user.id !== event.owner)
        return interaction.reply({ content: 'Только создатель', ephemeral: true });

      event.closed = true;
      save();

      await interaction.update({
        embeds: [createEmbed(event)],
        components: []
      });
    }

    // EDIT
    if (action === 'edit') {
      if (interaction.user.id !== event.owner)
        return interaction.reply({ content: 'Только создатель', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`editmodal_${id}`)
        .setTitle('Изменить');

      const input = new TextInputBuilder()
        .setCustomId('date')
        .setLabel('Новая дата')
        .setStyle(TextInputStyle.Short);

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      await interaction.showModal(modal);
    }
  }

  // модалки
  if (interaction.isModalSubmit()) {

    // JOIN modal
    if (interaction.customId.startsWith('modal_')) {
      const id = interaction.customId.split('_')[1];
      const event = eventsData[id];

      const nick = interaction.fields.getTextInputValue('nick');

      event.users.push({
        id: interaction.user.id,
        nick
      });

      save();

      await interaction.update({
        embeds: [createEmbed(event)]
      });
    }

    // EDIT modal
    if (interaction.customId.startsWith('editmodal_')) {
      const id = interaction.customId.split('_')[1];
      const event = eventsData[id];

      const newDate = interaction.fields.getTextInputValue('date');

      event.date = newDate;
      save();

      await interaction.update({
        embeds: [createEmbed(event)]
      });
    }
  }

});

// команда
const commands = [
  new SlashCommandBuilder()
    .setName('капт')
    .setDescription('Создать капт')
    .addStringOption(opt =>
      opt.setName('дата')
        .setDescription('Дата и время')
        .setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('колво')
        .setDescription('Количество людей')
        .setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
})();

client.login(TOKEN);