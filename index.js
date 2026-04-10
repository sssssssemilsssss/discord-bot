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

/* ─────────────────────────────
   💎 PREMIUM STYLE FUNCTIONS
───────────────────────────── */

function toSmallCaps(text) {
  const map = {
    a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ғ',
    g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',
    m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',
    s:'s',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',
    y:'ʏ',z:'ᴢ'
  };

  return text.toLowerCase().split('').map(c => map[c] || c).join('');
}

function randomColor() {
  const colors = [
    0x2b2d31, // dark
    0x5865f2, // discord blurple
    0x57f287, // green
    0xed4245, // red
    0xf1c40f, // yellow
    0x9b59b6, // purple
    0x00b0f4  // blue
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

/* ─────────────────────────────
   💾 SAVE / LOAD
───────────────────────────── */

if (fs.existsSync('data.json')) {
  eventsData = JSON.parse(fs.readFileSync('data.json'));
}

function save() {
  fs.writeFileSync('data.json', JSON.stringify(eventsData, null, 2));
}

/* ─────────────────────────────
   💎 EMBED DESIGN (PREMIUM)
───────────────────────────── */

function createEmbed(event) {

  let list = event.users
    .map((u, i) =>
      `${i === 0 ? '👑' : '▫️'} <@${u.id}> • ${u.nick}`
    )
    .join('\n');

  return new EmbedBuilder()
    .setColor(randomColor())
    .setTitle(toSmallCaps('🔥 КАПТ СИСТЕМА'))
    .setDescription(
      `👤 **Создатель:** <@${event.owner}>\n` +
      `📅 **Дата:** \`${event.date}\`\n` +
      `👥 **Лимит:** \`${event.max}\`\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👥 **Участники (${event.users.length}/${event.max})**\n\n` +
      `${list || 'Пока никого нет 😴'}`
    )
    .setFooter({ text: 'Premium Event System • Discord Bot' })
    .setTimestamp();
}

/* ─────────────────────────────
   🚀 READY
───────────────────────────── */

client.once(Events.ClientReady, () => {
  console.log(`Бот запущен как ${client.user.tag}`);
});

/* ─────────────────────────────
   🎯 INTERACTIONS
───────────────────────────── */

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
        closed: false
      };

      save();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`join_${id}`)
          .setLabel('Присоединиться')
          .setStyle(ButtonStyle.Success)
          .setEmoji('➕'),

        new ButtonBuilder()
          .setCustomId(`leave_${id}`)
          .setLabel('Выйти')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🚪'),

        new ButtonBuilder()
          .setCustomId(`edit_${id}`)
          .setLabel('Изменить')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('✏️'),

        new ButtonBuilder()
          .setCustomId(`close_${id}`)
          .setLabel('Закрыть')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔒')
      );

      await interaction.reply({
        content: toSmallCaps(`<@&${ROLE_ID}> 🔥 новый капт`),
        embeds: [createEmbed(eventsData[id])],
        components: [row]
      });
    }
  }

  /* ───── BUTTONS ───── */
  if (interaction.isButton()) {

    const [action, id] = interaction.customId.split('_');
    const event = eventsData[id];
    if (!event) return;

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
        .setLabel('Ваш игровой ник')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      return interaction.showModal(modal);
    }

    /* LEAVE */
    if (action === 'leave') {
      event.users = event.users.filter(u => u.id !== interaction.user.id);
      save();

      return interaction.update({
        embeds: [createEmbed(event)]
      });
    }

    /* CLOSE */
    if (action === 'close') {

      if (interaction.user.id !== event.owner)
        return interaction.reply({ content: '❌ Только создатель', ephemeral: true });

      event.closed = true;
      save();

      return interaction.update({
        embeds: [createEmbed(event)],
        components: []
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
        .setLabel('Новая дата/время')
        .setStyle(TextInputStyle.Short);

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      return interaction.showModal(modal);
    }
  }

  /* ───── MODALS ───── */
  if (interaction.isModalSubmit()) {

    if (interaction.customId.startsWith('modal_')) {

      const id = interaction.customId.split('_')[1];
      const event = eventsData[id];

      event.users.push({
        id: interaction.user.id,
        nick: interaction.fields.getTextInputValue('nick')
      });

      save();

      return interaction.reply({
        content: '✅ Ты добавлен!',
        ephemeral: true
      });
    }

    if (interaction.customId.startsWith('editmodal_')) {

      const id = interaction.customId.split('_')[1];
      const event = eventsData[id];

      event.date = interaction.fields.getTextInputValue('date');
      save();

      return interaction.reply({
        content: '✏️ Дата обновлена!',
        ephemeral: true
      });
    }
  }
});

/* ─────────────────────────────
   📌 SLASH COMMAND REGISTER
───────────────────────────── */

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
