// index.js
// Capture Bot Discord.js v14

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

let data = {};
if (fs.existsSync("data.json")) {
  data = JSON.parse(fs.readFileSync("data.json", "utf8"));
}

function save() {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

// Вытащить user ID из упоминания <@123456> или просто числа
function parseUserId(raw) {
  const match = raw.trim().match(/^<@!?(\d+)>$|^(\d+)$/);
  return match ? (match[1] || match[2]) : null;
}

function makeEmbed(c) {
  const admins = c.admins.length
    ? c.admins.map(x => `<@${x}>`).join(", ")
    : "Нет";

  const mainUsers = c.users.length
    ? c.users.map((u, idx) => `${idx + 1}. <@${u}>`).join("\n")
    : "Пока никто не записался";

  const embed = new EmbedBuilder()
    .setColor("#5865F2")
    .setTitle(`🎯 ${c.title}`)
    .setDescription(mainUsers)
    .addFields(
      { name: "📅 Время",    value: c.date,                         inline: true },
      { name: "👥 Участники", value: `${c.users.length}`,            inline: true },
      { name: "📊 Статус",   value: c.closed ? "Закрыт" : "Открыт", inline: true },
      { name: "🛡 Админы",   value: admins }
    );

  if (c.reserves && c.reserves.length > 0) {
    const reserveList = c.reserves.map((u, idx) => `${idx + 1}. <@${u}>`).join("\n");
    embed.addFields({ name: "🔄 Замена", value: reserveList });
  }

  embed.setTimestamp();
  return embed;
}

function mainRow(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`join_${id}`).setLabel("✅ Записаться").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`leave_${id}`).setLabel("❌ Покинуть").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`manage_${id}`).setLabel("⚙ Управление").setStyle(ButtonStyle.Primary)
  );
}

async function refresh(msg, c) {
  await msg.edit({ embeds: [makeEmbed(c)], components: [mainRow(c.id)] });
}

// Вспомогательная функция — получить сообщение капта по любому channel-like объекту
async function fetchCaptMsg(channel, c) {
  return channel.messages.fetch(c.messageId).catch(() => null);
}

client.once(Events.ClientReady, () => console.log("READY"));

client.on(Events.InteractionCreate, async i => {

  // ── Slash command ──────────────────────────────────────────────────────────
  if (i.isChatInputCommand() && i.commandName === "капт") {
    const id = Date.now().toString();

    data[id] = {
      id,
      owner:    i.user.id,
      admins:   [],
      users:    [],
      reserves: [],          // список замены
      title:    i.options.getString("название"),
      date:     i.options.getString("дата"),
      closed:   false,
      threadId: null
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

  // ── Buttons ────────────────────────────────────────────────────────────────
  if (i.isButton()) {
    const parts  = i.customId.split("_");
    const action = parts[0];
    const id     = parts[1];
    const c      = data[id];
    if (!c) return;

    // Записаться
    if (action === "join") {
      if (c.closed)
        return i.reply({ content: "Капт закрыт", ephemeral: true });
      if (c.users.includes(i.user.id))
        return i.reply({ content: "Вы уже записаны", ephemeral: true });

      c.users.push(i.user.id);
      save();
      await refresh(i.message, c);
      return i.reply({ content: "✅ Вы записаны!", ephemeral: true });
    }

    // Покинуть
    if (action === "leave") {
      const wasUser    = c.users.includes(i.user.id);
      const wasReserve = c.reserves.includes(i.user.id);
      if (!wasUser && !wasReserve)
        return i.reply({ content: "Вас нет в списке", ephemeral: true });

      c.users    = c.users.filter(x => x !== i.user.id);
      c.reserves = c.reserves.filter(x => x !== i.user.id);
      save();
      await refresh(i.message, c);
      return i.reply({ content: "Вы вышли из списка", ephemeral: true });
    }

    const canManage = c.owner === i.user.id || c.admins.includes(i.user.id);

    // Управление
    if (action === "manage") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });

      const r1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`title_${id}`).setLabel("✏️ Название").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`time_${id}`).setLabel("🕐 Время").setStyle(ButtonStyle.Primary)
      );

      const r2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`addadmin_${id}`).setLabel("➕ Админ").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`deladmin_${id}`).setLabel("➖ Админ").setStyle(ButtonStyle.Danger)
      );

      const r3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`adduser_${id}`).setLabel("➕ Участник").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`deluser_${id}`).setLabel("➖ Участник").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`reserve_${id}`).setLabel("🔄 Замена").setStyle(ButtonStyle.Secondary)
      );

      const r4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`thread_${id}`).setLabel("🧵 Ветка").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`toggle_${id}`).setLabel("Открыть/Закрыть").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`delete_${id}`).setLabel("🗑 Удалить").setStyle(ButtonStyle.Danger)
      );

      return i.reply({ content: "⚙️ Панель управления", components: [r1, r2, r3, r4], ephemeral: true });
    }

    // Модальные кнопки
    const modalMap = {
      title:    { title: "Изменить название",  label: "Новое название",                        hint: "Например: Капт субботы" },
      time:     { title: "Изменить время",     label: "Новое время/дата",                      hint: "Например: Суббота 20:00" },
      addadmin: { title: "Добавить админа",    label: "Упомяните пользователя (@ник или ID)",  hint: "@username или 123456789" },
      deladmin: { title: "Убрать админа",      label: "Упомяните пользователя (@ник или ID)",  hint: "@username или 123456789" },
      adduser:  { title: "Добавить участника", label: "Упомяните участника (@ник или ID)",     hint: "@username или 123456789" },
      deluser:  { title: "Убрать участника",   label: "Упомяните участника (@ник или ID)",     hint: "@username или 123456789" },
      reserve:  { title: "Управление заменой", label: "Упомяните (@ник или ID) — добавить/убрать из замены", hint: "@username или 123456789" }
    };

    if (modalMap[action]) {
      const cfg = modalMap[action];
      const m = new ModalBuilder()
        .setCustomId(`${action}m_${id}`)
        .setTitle(cfg.title);

      m.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("value")
            .setLabel(cfg.label)
            .setPlaceholder(cfg.hint)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      return i.showModal(m);
    }

    // Создать ветку
    if (action === "thread") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      if (c.threadId)  return i.reply({ content: "❌ Ветка уже создана", ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`threadm_${id}`)
        .setTitle("Создание ветки");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("thread_name")
            .setLabel("Название ветки")
            .setPlaceholder("Например: Капт 20:00")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
        )
      );

      return i.showModal(modal);
    }

    // Открыть / Закрыть
    if (action === "toggle") {
      c.closed = !c.closed;
      save();
      await refresh(i.message, c);
      return i.reply({ content: `Капт теперь ${c.closed ? "закрыт 🔒" : "открыт 🔓"}`, ephemeral: true });
    }

    // Удалить
    if (action === "delete") {
      if (i.user.id !== c.owner)
        return i.reply({ content: "Только владелец может удалить капт", ephemeral: true });

      delete data[id];
      save();
      await i.message.delete().catch(() => {});
      return i.reply({ content: "Капт удалён", ephemeral: true });
    }
  }

  // ── Modal submits ──────────────────────────────────────────────────────────
  if (i.isModalSubmit()) {
    const parts  = i.customId.split("_");
    const action = parts[0];
    const id     = parts[1];
    const c      = data[id];
    if (!c) return;

    // Создание ветки
    if (action === "threadm") {
      if (c.threadId)
        return i.reply({ content: "❌ Ветка уже существует", ephemeral: true });

      const threadName = i.fields.getTextInputValue("thread_name");
      const msg = await fetchCaptMsg(i.channel, c);
      if (!msg) return i.reply({ content: "Не удалось найти сообщение капта", ephemeral: true });

      const thread = await msg.startThread({
        name: threadName,
        autoArchiveDuration: 1440
      }).catch(() => null);

      if (!thread) return i.reply({ content: "Не удалось создать ветку", ephemeral: true });

      c.threadId = thread.id;
      save();

      // Упомянуть всех участников + замену
      const allMentions = [
        ...c.users,
        ...(c.reserves || [])
      ].map(u => `<@${u}>`).join(" ");

      if (allMentions) {
        await thread.send(`👥 Участники капта: ${allMentions}`).catch(() => {});
      }

      return i.reply({ content: `🧵 Ветка создана: <#${thread.id}>`, ephemeral: true });
    }

    // Остальные модальные формы
    const raw   = i.fields.getTextInputValue("value");
    const value = raw.trim();

    if (action === "titlem") {
      c.title = value;
    }

    if (action === "timem") {
      c.date = value;
    }

    // Для действий с пользователями — парсим упоминание
    const userActions = ["addadminm", "deladminm", "adduserm", "deluserm", "reservem"];
    if (userActions.includes(action)) {
      const userId = parseUserId(value);
      if (!userId)
        return i.reply({ content: "❌ Не удалось распознать пользователя. Используйте @упоминание или числовой ID.", ephemeral: true });

      if (action === "addadminm") {
        if (!c.admins.includes(userId)) c.admins.push(userId);
      }
      if (action === "deladminm") {
        c.admins = c.admins.filter(x => x !== userId);
      }
      if (action === "adduserm") {
        if (c.users.includes(userId))
          return i.reply({ content: "Этот участник уже в списке", ephemeral: true });
        // Убираем из замены если там был
        c.reserves = (c.reserves || []).filter(x => x !== userId);
        c.users.push(userId);
      }
      if (action === "deluserm") {
        c.users = c.users.filter(x => x !== userId);
      }
      if (action === "reservem") {
        c.reserves = c.reserves || [];
        if (c.reserves.includes(userId)) {
          // Если уже в замене — убираем (toggle)
          c.reserves = c.reserves.filter(x => x !== userId);
        } else {
          // Убираем из основного списка и добавляем в замену
          c.users    = c.users.filter(x => x !== userId);
          c.reserves.push(userId);
        }
      }
    }

    save();

    const msg = await fetchCaptMsg(i.channel, c);
    if (msg) await refresh(msg, c);

    return i.reply({ content: "✅ Сохранено", ephemeral: true });
  }
});

// ── Register slash commands ────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("капт")
    .setDescription("Создать капт")
    .addStringOption(o => o.setName("название").setDescription("Название").setRequired(true))
    .addStringOption(o => o.setName("дата").setDescription("Дата/время").setRequired(true))
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
  await client.login(TOKEN);
})();
