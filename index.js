
// index.js
// Optimized Capture Bot (Discord.js v14)
// Features:
// - No nickname modal
// - Modern embeds
// - Capture admins
// - Join/Leave
// - Management menu
// - JSON storage

const {
 Client,
 GatewayIntentBits,
 EmbedBuilder,
 ActionRowBuilder,
 ButtonBuilder,
 ButtonStyle,
 SlashCommandBuilder,
 REST,
 Routes,
 Events
} = require("discord.js");

const fs = require("fs");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const client = new Client({
 intents: [GatewayIntentBits.Guilds]
});

let data = {};
if (fs.existsSync("./data.json")) {
 data = JSON.parse(fs.readFileSync("./data.json"));
}

const save = () =>
 fs.writeFileSync("./data.json", JSON.stringify(data, null, 2));

function captureEmbed(capt) {
 const users = capt.users.length
  ? capt.users
      .map((u, i) => `${i + 1}. <@${u.id}>`)
      .join("\n")
  : "Пока никто не записался";

 return new EmbedBuilder()
  .setColor("#5865F2")
  .setTitle(`🎯 ${capt.title}`)
  .addFields(
   { name: "📅 Время", value: capt.date, inline: true },
   { name: "👥 Участники", value: `${capt.users.length}/${capt.max}`, inline: true },
   { name: "📊 Статус", value: capt.closed ? "Закрыт" : "Открыт", inline: true }
  )
  .setDescription(users)
  .setTimestamp();
}

client.once(Events.ClientReady, () => {
 console.log("Bot ready");
});

client.on(Events.InteractionCreate, async interaction => {
 if (interaction.isChatInputCommand()) {
  if (interaction.commandName === "капт") {

   const id = Date.now().toString();

   data[id] = {
    owner: interaction.user.id,
    admins: [],
    title: interaction.options.getString("название"),
    date: interaction.options.getString("дата"),
    max: interaction.options.getInteger("колво"),
    users: [],
    closed: false
   };

   save();

   const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`join_${id}`)
      .setLabel("✅ Записаться")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`leave_${id}`)
      .setLabel("❌ Покинуть")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`manage_${id}`)
      .setLabel("⚙ Управление")
      .setStyle(ButtonStyle.Primary)
   );

   await interaction.reply({
    embeds: [captureEmbed(data[id])],
    components: [row]
   });
  }
 }

 if (interaction.isButton()) {

  const [action, id] = interaction.customId.split("_");
  const capt = data[id];

  if (!capt) return;

  if (action === "join") {

   if (capt.closed)
    return interaction.reply({
      content: "Капт закрыт",
      ephemeral: true
    });

   if (!capt.users.find(x => x.id === interaction.user.id)) {
    capt.users.push({
      id: interaction.user.id
    });

    save();
   }

   return interaction.reply({
    content: "Вы записаны",
    ephemeral: true
   });
  }

  if (action === "leave") {

   capt.users = capt.users.filter(
    x => x.id !== interaction.user.id
   );

   save();

   return interaction.reply({
    content: "Вы вышли",
    ephemeral: true
   });
  }

  if (action === "manage") {

   const canManage =
    capt.owner === interaction.user.id ||
    capt.admins.includes(interaction.user.id);

   if (!canManage)
    return interaction.reply({
      content: "Нет прав",
      ephemeral: true
    });

   return interaction.reply({
    content:
`Панель управления:
- Добавить администратора
- Удалить администратора
- Изменить время
- Изменить лимит
- Закрыть/Открыть капт`,
    ephemeral: true
   });
  }
 }
});

const commands = [
 new SlashCommandBuilder()
  .setName("капт")
  .setDescription("Создать капт")
  .addStringOption(o =>
    o.setName("название")
      .setDescription("Название")
      .setRequired(true))
  .addStringOption(o =>
    o.setName("дата")
      .setDescription("Дата/время")
      .setRequired(true))
  .addIntegerOption(o =>
    o.setName("колво")
      .setDescription("Лимит")
      .setRequired(true))
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
 await rest.put(
  Routes.applicationGuildCommands(
   CLIENT_ID,
   GUILD_ID
  ),
  { body: commands }
 );

 client.login(TOKEN);
})();
