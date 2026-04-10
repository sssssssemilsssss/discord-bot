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

/* ───── LOAD DATA ───── */

if (fs.existsSync('data.json')) {
  eventsData = JSON.parse(fs.readFileSync('data.json'));
}

function save() {
  fs.writeFileSync('data.json', JSON.stringify(eventsData, null, 2));
}

/* ───── EMBED (БЕЗ ТАЙМЕРА) ───── */

function createEmbed(event) {

  const list = event.users
    .map((u, i) =>
      `${i === 0 ? '👑' : '▫️'} <@${u.id}> • ${u.nick}`
    )
    .join('\n');

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setDescription(
      `👤 **Создатель:** <@${event.owner}>\n` +
      `📅 **Дата:** \`${event.date}\`\n` +
      `👥 **Лимит:** \`${event.max}\`\n\n` +
      `👥 **Участники (${event.users.length}/${event.max})**\n\n` +
      `${list || 'Пока никого нет'}`
    )
    .setTimestamp();
}

/* ───── READY ───── */

client.once(Events.ClientReady, () => {
  console.log(`Бот запущен как ${client.user.tag}`);
});

/* ───── INTERACTIONS ───── */

client.on(Events.InteractionCreate, async interaction => {

  /* ───── SLASH COMMAND ───── */

  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === 'капт') {

      const date = interaction.options.getString('дата');
      const max = interaction.options.getInteger('колво');

      const id = Date.now().toString();

      eventsData[id] = {
        owner: interaction.user.id,
        date,
        max,
        users: [],
        closed: false,
        messageId: null
      };

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`join_${id}`)
          .setLabel('Присоединиться')
          .setEmoji('➕')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`leave_${id}`)
          .setLabel('Выйти')
          .setEmoji('🚪')
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId(`edit_${id}`)
          .setLabel('Изменить')
          .setEmoji('✏️')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId(`close_${id}`)
          .setLabel('Закрыть')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Secondary)
      );

      const msg = await interaction.reply({
        content: `<@&${ROLE_ID}>`,
        embeds: [createEmbed(eventsData[id])],
        components: [row],
        fetchReply: true
      });

      eventsData[id].messageId = msg.id;
      save();
    }
  }

  /* ───── BUTTONS ───── */

  if (interaction.isButton()) {

    const [action, id] = interaction.customId.split('_');
    const event = eventsData[id];
    if (!event) return;

    const channel = interaction.channel;

    /* JOIN */
    if (action === 'join') {

      if (event.closed)
        return interaction.reply({ content: '🔒 Набор закрыт', ephemeral: true });

      if (event.users.find(u => u.id === interaction.user.id))
        return interaction.reply({ content: '❌ Ты уже в списке', ephemeral: true });

      if (event.users.length >= event.max)
        return interaction.reply({ content: '🚫 Мест нет', ephemeral: true });

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

    /* LEAVE */
    if (action === 'leave') {

      event.users = event.users.filter(u => u.id !== interaction.user.id);
      save();

      const msg = await channel.messages.fetch(event.messageId);
      await msg.edit({ embeds: [createEmbed(event)] });

      return interaction.reply({
        content: '🚪 Ты вышел из списка',
        ephemeral: true
      });
    }

    /* CLOSE */
    if (action === 'close') {

      if (interaction.user.id !== event.owner)
        return interaction.reply({ content: '❌ Только создатель', ephemeral: true });

      event.closed = true;
      save();

      const msg = await channel.messages.fetch(event.messageId);
      await msg.edit({
        embeds: [createEmbed(event)],
        components: []
      });

      return interaction.reply({
        content: '🔒 Набор закрыт',
        ephemeral: true
      });
    }

    /* EDIT */
    if (action === 'edit') {

      if (interaction.user.id !== event.owner)
        return interaction.reply({ content: '❌ Только создатель', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`editmodal_${id}`)
        .setTitle('Изменить дату');

      const input = new TextInputBuilder()
        .setCustomId('date')
        .setLabel('Новая дата')
        .setStyle(TextInputStyle.Short);

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      return interaction.showModal(modal);
    }
  }

  /* ───── MODALS ───── */

  if (interaction.isModalSubmit()) {

    /* JOIN */
    if (interaction.customId.startsWith('modal_')) {

      const id = interaction.customId.split('_')[1];
      const event = eventsData[id];

      event.users.push({
        id: interaction.user.id,
        nick: interaction.fields.getTextInputValue('nick')
      });

      save();

      const msg = await interaction.channel.messages.fetch(event.messageId);
      await msg.edit({ embeds: [createEmbed(event)] });

      return interaction.reply({
        content: '✅ Ты добавлен',
        ephemeral: true
      });
    }

    /* EDIT */
    if (interaction.customId.startsWith('editmodal_')) {

      const id = interaction.customId.split('_')[1];
      const event = eventsData[id];

      event.date = interaction.fields.getTextInputValue('date');

      save();

      const msg = await interaction.channel.messages.fetch(event.messageId);
      await msg.edit({ embeds: [createEmbed(event)] });

      return interaction.reply({
        content: '✏️ Дата обновлена',
        ephemeral: true
      });
    }
  }
});

/* ───── COMMANDS ───── */

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
