// index.js — Capture Bot Discord.js v14

const {
  Client, GatewayIntentBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  SlashCommandBuilder, REST, Routes, Events
} = require("discord.js");
const fs = require("fs");

const TOKEN     = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID  = process.env.GUILD_ID;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ── Persistence ──────────────────────────────────────────────────────────────
let data = {};
if (fs.existsSync("data.json"))
  data = JSON.parse(fs.readFileSync("data.json", "utf8"));

function save() {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

// ── Embed ────────────────────────────────────────────────────────────────────
function makeEmbed(c) {
  const admins = c.admins.length
    ? c.admins.map(x => `<@${x}>`).join(", ")
    : "Нет";

  const mainList = c.users.length
    ? c.users.map((u, i) => `${i + 1}. <@${u}>`).join("\n")
    : "Пока никто не записался";

  const embed = new EmbedBuilder()
    .setColor("#5865F2")
    .setTitle(`🎯 ${c.title}`)
    .setDescription(mainList)
    .addFields(
      { name: "📅 Время",     value: c.date,                          inline: true },
      { name: "👥 Участники", value: String(c.users.length),          inline: true },
      { name: "📊 Статус",    value: c.closed ? "🔒 Закрыт" : "🔓 Открыт", inline: true },
      { name: "🛡 Админы",    value: admins }
    );

  if (c.reserves.length > 0)
    embed.addFields({
      name:  "🔄 Замена",
      value: c.reserves.map((u, i) => `${i + 1}. <@${u}>`).join("\n")
    });

  return embed.setTimestamp();
}

// ── Main row (public buttons) ────────────────────────────────────────────────
function mainRow(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`join:${id}`).setLabel("✅ Записаться").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`leave:${id}`).setLabel("❌ Покинуть").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`manage:${id}`).setLabel("⚙ Управление").setStyle(ButtonStyle.Primary)
  );
}

// ── Refresh embed ────────────────────────────────────────────────────────────
async function refresh(channel, c) {
  const msg = await channel.messages.fetch(c.messageId).catch(() => null);
  if (msg) await msg.edit({ embeds: [makeEmbed(c)], components: [mainRow(c.id)] });
}

// ── Build user-picker rows (кнопки с именами участников) ─────────────────────
// action: строка вроде "pick-deluser", "pick-reserve", "pick-deladmin"
// список users — массив ID
// Discord: max 5 кнопок в строке, max 5 строк => 25 кнопок max
function buildPickerRows(action, captId, userIds, guild) {
  const rows = [];
  let row = new ActionRowBuilder();
  let count = 0;

  for (const uid of userIds) {
    if (count >= 25) break; // Discord hard limit

    const member = guild.members.cache.get(uid);
    const label  = member ? (member.displayName || member.user.username) : uid;

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${action}:${captId}:${uid}`)
        .setLabel(label.slice(0, 80))
        .setStyle(ButtonStyle.Secondary)
    );
    count++;

    if (count % 5 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
  }

  if (count % 5 !== 0) rows.push(row);
  return rows;
}

// ── Ready ────────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
  console.log(`READY as ${client.user.tag}`);
  // Прогреть кеш участников всех серверов
  for (const guild of client.guilds.cache.values())
    await guild.members.fetch().catch(() => {});
});

// ── Interactions ─────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async i => {

  // ═══════════════════════════════════════════════════════════════════════════
  // SLASH
  // ═══════════════════════════════════════════════════════════════════════════
  if (i.isChatInputCommand() && i.commandName === "капт") {
    const id = Date.now().toString();

    data[id] = {
      id,
      owner:    i.user.id,
      admins:   [],
      users:    [],
      reserves: [],
      title:    i.options.getString("название"),
      date:     i.options.getString("дата"),
      closed:   false,
      threadId: null,
      messageId: null
    };

    const msg = await i.reply({
      embeds:     [makeEmbed(data[id])],
      components: [mainRow(id)],
      fetchReply: true
    });

    data[id].messageId = msg.id;
    save();
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUTTONS
  // ═══════════════════════════════════════════════════════════════════════════
  if (i.isButton()) {
    // customId формат: "action:captId" или "action:captId:userId"
    const parts    = i.customId.split(":");
    const action   = parts[0];
    const captId   = parts[1];
    const targetId = parts[2]; // есть только у picker-кнопок

    const c = data[captId];
    if (!c) return i.reply({ content: "Капт не найден", ephemeral: true });

    const canManage = c.owner === i.user.id || c.admins.includes(i.user.id);

    // ── Публичные ────────────────────────────────────────────────────────────

    if (action === "join") {
      if (c.closed)
        return i.reply({ content: "Капт закрыт 🔒", ephemeral: true });
      if (c.users.includes(i.user.id) || c.reserves.includes(i.user.id))
        return i.reply({ content: "Вы уже в списке", ephemeral: true });
      c.users.push(i.user.id);
      save();
      await refresh(i.channel, c);
      return i.reply({ content: "✅ Вы записаны!", ephemeral: true });
    }

    if (action === "leave") {
      const inMain    = c.users.includes(i.user.id);
      const inReserve = c.reserves.includes(i.user.id);
      if (!inMain && !inReserve)
        return i.reply({ content: "Вас нет в списке", ephemeral: true });
      c.users    = c.users.filter(x => x !== i.user.id);
      c.reserves = c.reserves.filter(x => x !== i.user.id);
      save();
      await refresh(i.channel, c);
      return i.reply({ content: "Вы вышли из списка", ephemeral: true });
    }

    // ── Панель управления ─────────────────────────────────────────────────────

    if (action === "manage") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });

      const r1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`edit-title:${captId}`).setLabel("✏️ Название").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`edit-time:${captId}`).setLabel("🕐 Время").setStyle(ButtonStyle.Primary)
      );
      const r2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`adduser:${captId}`).setLabel("➕ Участник").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`deluser:${captId}`).setLabel("➖ Участник").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`tomreserve:${captId}`).setLabel("🔄 В замену").setStyle(ButtonStyle.Secondary)
      );
      const r3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`addadmin:${captId}`).setLabel("➕ Админ").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`deladmin:${captId}`).setLabel("➖ Админ").setStyle(ButtonStyle.Danger)
      );
      const r4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`thread:${captId}`).setLabel("🧵 Ветка").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`toggle:${captId}`).setLabel("Открыть/Закрыть").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`delete:${captId}`).setLabel("🗑 Удалить").setStyle(ButtonStyle.Danger)
      );

      return i.reply({ content: "⚙️ Панель управления", components: [r1, r2, r3, r4], ephemeral: true });
    }

    // ── Редактирование через модалку (только текст) ────────────────────────

    if (action === "edit-title") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      const m = new ModalBuilder().setCustomId(`modal-title:${captId}`).setTitle("Изменить название");
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("val").setLabel("Новое название").setStyle(TextInputStyle.Short).setRequired(true).setValue(c.title)
      ));
      return i.showModal(m);
    }

    if (action === "edit-time") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      const m = new ModalBuilder().setCustomId(`modal-time:${captId}`).setTitle("Изменить время");
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("val").setLabel("Новое время/дата").setStyle(TextInputStyle.Short).setRequired(true).setValue(c.date)
      ));
      return i.showModal(m);
    }

    // ── Добавить участника (модалка с ID/упоминанием) ─────────────────────

    if (action === "adduser") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      const m = new ModalBuilder().setCustomId(`modal-adduser:${captId}`).setTitle("Добавить участника");
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("val")
          .setLabel("ID пользователя")
          .setPlaceholder("Вставьте числовой ID (ПКМ → Копировать ID)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ));
      return i.showModal(m);
    }

    // ── Добавить админа (модалка) ─────────────────────────────────────────

    if (action === "addadmin") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      const m = new ModalBuilder().setCustomId(`modal-addadmin:${captId}`).setTitle("Добавить админа");
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("val")
          .setLabel("ID пользователя")
          .setPlaceholder("Вставьте числовой ID (ПКМ → Копировать ID)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ));
      return i.showModal(m);
    }

    // ── Убрать участника — picker-кнопки ─────────────────────────────────

    if (action === "deluser") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      const all = [...c.users, ...c.reserves];
      if (!all.length)
        return i.reply({ content: "Список пуст", ephemeral: true });

      await i.deferReply({ ephemeral: true });
      await i.guild.members.fetch().catch(() => {});
      const rows = buildPickerRows("pick-del", captId, all, i.guild);
      return i.editReply({ content: "Выберите кого убрать:", components: rows });
    }

    // ── В замену — picker из основного списка ────────────────────────────

    if (action === "tomreserve") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      if (!c.users.length)
        return i.reply({ content: "Основной список пуст", ephemeral: true });

      await i.deferReply({ ephemeral: true });
      await i.guild.members.fetch().catch(() => {});
      const rows = buildPickerRows("pick-reserve", captId, c.users, i.guild);
      return i.editReply({ content: "Кого переместить в замену?", components: rows });
    }

    // ── Убрать админа — picker ────────────────────────────────────────────

    if (action === "deladmin") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      if (!c.admins.length)
        return i.reply({ content: "Нет админов", ephemeral: true });

      await i.deferReply({ ephemeral: true });
      await i.guild.members.fetch().catch(() => {});
      const rows = buildPickerRows("pick-deladmin", captId, c.admins, i.guild);
      return i.editReply({ content: "Кого убрать из админов?", components: rows });
    }

    // ── Picker-подтверждения ──────────────────────────────────────────────

    if (action === "pick-del") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      c.users    = c.users.filter(x => x !== targetId);
      c.reserves = c.reserves.filter(x => x !== targetId);
      save();
      await refresh(i.channel, c);
      return i.update({ content: `✅ <@${targetId}> удалён из списка`, components: [] });
    }

    if (action === "pick-reserve") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      if (!c.users.includes(targetId))
        return i.update({ content: "Пользователь не найден в основном списке", components: [] });
      c.users    = c.users.filter(x => x !== targetId);
      c.reserves = c.reserves.filter(x => x !== targetId);
      c.reserves.push(targetId);
      save();
      await refresh(i.channel, c);
      return i.update({ content: `🔄 <@${targetId}> перемещён в замену`, components: [] });
    }

    if (action === "pick-deladmin") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      c.admins = c.admins.filter(x => x !== targetId);
      save();
      await refresh(i.channel, c);
      return i.update({ content: `✅ <@${targetId}> убран из админов`, components: [] });
    }

    // ── Ветка ────────────────────────────────────────────────────────────────

    if (action === "thread") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      if (c.threadId)  return i.reply({ content: "❌ Ветка уже создана", ephemeral: true });

      const m = new ModalBuilder().setCustomId(`modal-thread:${captId}`).setTitle("Создание ветки");
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("val")
          .setLabel("Название ветки")
          .setPlaceholder("Например: Капт 20:00")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      ));
      return i.showModal(m);
    }

    // ── Открыть/Закрыть ──────────────────────────────────────────────────────

    if (action === "toggle") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      c.closed = !c.closed;
      save();
      await refresh(i.channel, c);
      return i.reply({ content: `Капт теперь ${c.closed ? "закрыт 🔒" : "открыт 🔓"}`, ephemeral: true });
    }

    // ── Удалить ───────────────────────────────────────────────────────────────

    if (action === "delete") {
      if (i.user.id !== c.owner)
        return i.reply({ content: "Только владелец может удалить капт", ephemeral: true });
      const msg = await i.channel.messages.fetch(c.messageId).catch(() => null);
      delete data[captId];
      save();
      if (msg) await msg.delete().catch(() => {});
      return i.reply({ content: "Капт удалён", ephemeral: true });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODALS
  // ═══════════════════════════════════════════════════════════════════════════
  if (i.isModalSubmit()) {
    const parts  = i.customId.split(":");
    const action = parts[0]; // "modal-title", "modal-adduser", ...
    const captId = parts[1];
    const c      = data[captId];
    if (!c) return i.reply({ content: "Капт не найден", ephemeral: true });

    const val = i.fields.getTextInputValue("val").trim();

    if (action === "modal-title") {
      c.title = val;
      save();
      await refresh(i.channel, c);
      return i.reply({ content: "✅ Название обновлено", ephemeral: true });
    }

    if (action === "modal-time") {
      c.date = val;
      save();
      await refresh(i.channel, c);
      return i.reply({ content: "✅ Время обновлено", ephemeral: true });
    }

    // Добавить участника — принимаем чистый ID
    if (action === "modal-adduser") {
      const uid = val.replace(/\D/g, ""); // оставить только цифры
      if (!uid)
        return i.reply({ content: "❌ Введите числовой ID пользователя", ephemeral: true });
      if (c.users.includes(uid) || c.reserves.includes(uid))
        return i.reply({ content: "Этот пользователь уже в списке", ephemeral: true });
      c.users.push(uid);
      save();
      await refresh(i.channel, c);
      return i.reply({ content: `✅ <@${uid}> добавлен в список`, ephemeral: true });
    }

    // Добавить админа
    if (action === "modal-addadmin") {
      const uid = val.replace(/\D/g, "");
      if (!uid)
        return i.reply({ content: "❌ Введите числовой ID пользователя", ephemeral: true });
      if (!c.admins.includes(uid)) c.admins.push(uid);
      save();
      await refresh(i.channel, c);
      return i.reply({ content: `✅ <@${uid}> добавлен как админ`, ephemeral: true });
    }

    // Создать ветку
    if (action === "modal-thread") {
      if (c.threadId)
        return i.reply({ content: "❌ Ветка уже существует", ephemeral: true });

      const msg = await i.channel.messages.fetch(c.messageId).catch(() => null);
      if (!msg) return i.reply({ content: "Не удалось найти сообщение капта", ephemeral: true });

      const thread = await msg.startThread({ name: val, autoArchiveDuration: 1440 }).catch(() => null);
      if (!thread) return i.reply({ content: "Не удалось создать ветку", ephemeral: true });

      c.threadId = thread.id;
      save();

      const allIds = [...c.users, ...c.reserves];
      if (allIds.length) {
        const mentions = allIds.map(u => `<@${u}>`).join(" ");
        await thread.send(`👥 Участники капта: ${mentions}`).catch(() => {});
      }

      return i.reply({ content: `🧵 Ветка создана: <#${thread.id}>`, ephemeral: true });
    }
  }
});

// ── Slash command registration ────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("капт")
    .setDescription("Создать новый капт")
    .addStringOption(o => o.setName("название").setDescription("Название капта").setRequired(true))
    .addStringOption(o => o.setName("дата").setDescription("Дата и время").setRequired(true))
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  await client.login(TOKEN);
})();
