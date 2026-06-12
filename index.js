// index.js — Capture Bot + Music | Discord.js v14

const {
  Client, GatewayIntentBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  SlashCommandBuilder, REST, Routes, Events
} = require("discord.js");

const {
  joinVoiceChannel, createAudioPlayer, createAudioResource,
  AudioPlayerStatus, VoiceConnectionStatus, entersState, getVoiceConnection
} = require("@discordjs/voice");

const playdl = require("play-dl");
const fs = require("fs");

const TOKEN     = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID  = process.env.GUILD_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

// ── Persistence ──────────────────────────────────────────────────────────────
let data = {};
if (fs.existsSync("data.json"))
  data = JSON.parse(fs.readFileSync("data.json", "utf8"));

function save() {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

// ── Music state per guild ────────────────────────────────────────────────────
// guildId => { queue: [], player, connection, current }
const music = new Map();

function getMusic(guildId) {
  if (!music.has(guildId))
    music.set(guildId, { queue: [], player: null, connection: null, current: null });
  return music.get(guildId);
}

// ── Play next track in queue ─────────────────────────────────────────────────
async function playNext(guildId) {
  const m = getMusic(guildId);
  if (!m.queue.length) {
    m.current = null;
    // Отключаемся через 5 минут тишины
    setTimeout(() => {
      const mc = getMusic(guildId);
      if (!mc.current && mc.connection) {
        mc.connection.destroy();
        mc.connection = null;
      }
    }, 5 * 60 * 1000);
    return;
  }

  const track = m.queue.shift();
  m.current = track;

  try {
    let stream;

    if (track.source === "youtube") {
      stream = await playdl.stream(track.url, { quality: 2 });
    } else {
      // SoundCloud
      stream = await playdl.stream(track.url);
    }

    const resource = createAudioResource(stream.stream, {
      inputType: stream.type
    });

    m.player.play(resource);
  } catch (err) {
    console.error("Ошибка воспроизведения:", err);
    playNext(guildId); // пропускаем сломанный трек
  }
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
      { name: "📅 Время",     value: c.date,                               inline: true },
      { name: "👥 Участники", value: String(c.users.length),               inline: true },
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
async function refresh(c) {
  try {
    const channel = await client.channels.fetch(c.channelId).catch(() => null);
    if (!channel) return;
    const msg = await channel.messages.fetch(c.messageId).catch(() => null);
    if (msg) await msg.edit({ embeds: [makeEmbed(c)], components: [mainRow(c.id)] });
  } catch {}
}

// ── Build picker rows ────────────────────────────────────────────────────────
function buildPickerRows(action, captId, userIds, guild) {
  const rows = [];
  let row = new ActionRowBuilder();
  let count = 0;

  for (const uid of userIds) {
    if (count >= 25) break;
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

// ── Build search result buttons ──────────────────────────────────────────────
function buildSearchRows(results, searchId) {
  const row = new ActionRowBuilder();
  results.forEach((track, idx) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`play-pick:${searchId}:${idx}`)
        .setLabel(`${idx + 1}. ${track.title.slice(0, 60)}`)
        .setStyle(ButtonStyle.Primary)
    );
  });
  return [row];
}

// Временное хранилище результатов поиска (очищается через 2 минуты)
const searchCache = new Map();

// ── Ready ────────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
  console.log(`READY as ${client.user.tag}`);
  for (const guild of client.guilds.cache.values())
    await guild.members.fetch().catch(() => {});
});

// ── Interactions ─────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async i => {

  // ═══════════════════════════════════════════════════════════════════════════
  // SLASH COMMANDS
  // ═══════════════════════════════════════════════════════════════════════════
  if (i.isChatInputCommand()) {

    // ── /капт ────────────────────────────────────────────────────────────────
    if (i.commandName === "капт") {
      const id = Date.now().toString();

      data[id] = {
        id,
        owner:    i.user.id,
        admins:   [],
        users:    [],
        reserves: [],
        title:    i.options.getString("название"),
        date:     i.options.getString("дата"),
        closed:    false,
        threadId:  null,
        messageId: null,
        channelId: i.channelId
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

    // ── /play ─────────────────────────────────────────────────────────────────
    if (i.commandName === "play") {
      const query = i.options.getString("запрос");

      // Проверяем что пользователь в войс-канале
      const voiceChannel = i.member?.voice?.channel;
      if (!voiceChannel)
        return i.reply({ content: "❌ Зайди в войс-канал сначала!", ephemeral: true });

      await i.deferReply();

      try {
        // Ищем на YouTube и SoundCloud параллельно
        const [ytResults, scResults] = await Promise.allSettled([
          playdl.search(query, { source: { youtube: "video" }, limit: 3 }),
          playdl.search(query, { source: { soundcloud: "tracks" }, limit: 2 })
        ]);

        const results = [];

        if (ytResults.status === "fulfilled") {
          for (const v of ytResults.value) {
            const dur = v.durationInSec
              ? `${Math.floor(v.durationInSec / 60)}:${String(v.durationInSec % 60).padStart(2, "0")}`
              : "?:??";
            results.push({
              title:  v.title || "Без названия",
              url:    v.url,
              dur,
              source: "youtube",
              emoji:  "▶️"
            });
          }
        }

        if (scResults.status === "fulfilled") {
          for (const v of scResults.value) {
            const dur = v.durationInSec
              ? `${Math.floor(v.durationInSec / 60)}:${String(v.durationInSec % 60).padStart(2, "0")}`
              : "?:??";
            results.push({
              title:  v.name || "Без названия",
              url:    v.url,
              dur,
              source: "soundcloud",
              emoji:  "☁️"
            });
          }
        }

        if (!results.length)
          return i.editReply("❌ Ничего не найдено. Попробуй другой запрос.");

        // Сохраняем в кеш
        const searchId = `${i.guildId}-${Date.now()}`;
        searchCache.set(searchId, { results, voiceChannelId: voiceChannel.id });
        setTimeout(() => searchCache.delete(searchId), 2 * 60 * 1000);

        // Формируем красивый список
        const list = results.map((r, idx) =>
          `**${idx + 1}.** ${r.emoji} ${r.title} \`[${r.dur}]\` — ${r.source === "youtube" ? "YouTube" : "SoundCloud"}`
        ).join("\n");

        const embed = new EmbedBuilder()
          .setColor("#FF0000")
          .setTitle("🔍 Результаты поиска")
          .setDescription(`**Запрос:** ${query}\n\n${list}`)
          .setFooter({ text: "Нажми кнопку чтобы включить трек" });

        const rows = buildSearchRows(results, searchId);
        return i.editReply({ embeds: [embed], components: rows });

      } catch (err) {
        console.error("Ошибка поиска:", err);
        return i.editReply("❌ Ошибка при поиске. Попробуй позже.");
      }
    }

    // ── /skip ─────────────────────────────────────────────────────────────────
    if (i.commandName === "skip") {
      const m = getMusic(i.guildId);
      if (!m.current)
        return i.reply({ content: "❌ Сейчас ничего не играет", ephemeral: true });
      m.player?.stop();
      return i.reply({ content: "⏭ Трек пропущен" });
    }

    // ── /stop ─────────────────────────────────────────────────────────────────
    if (i.commandName === "stop") {
      const m = getMusic(i.guildId);
      m.queue = [];
      m.current = null;
      m.player?.stop();
      m.connection?.destroy();
      m.connection = null;
      return i.reply({ content: "⏹ Музыка остановлена, бот вышел из канала" });
    }

    // ── /queue ────────────────────────────────────────────────────────────────
    if (i.commandName === "queue") {
      const m = getMusic(i.guildId);
      if (!m.current && !m.queue.length)
        return i.reply({ content: "📭 Очередь пуста", ephemeral: true });

      const lines = [];
      if (m.current)
        lines.push(`▶️ **Сейчас:** ${m.current.title} \`[${m.current.dur}]\``);
      m.queue.forEach((t, idx) =>
        lines.push(`${idx + 1}. ${t.emoji} ${t.title} \`[${t.dur}]\``)
      );

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("🎵 Очередь воспроизведения")
        .setDescription(lines.join("\n"));

      return i.reply({ embeds: [embed] });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUTTONS
  // ═══════════════════════════════════════════════════════════════════════════
  if (i.isButton()) {
    const parts    = i.customId.split(":");
    const action   = parts[0];

    // ── Выбор трека из поиска ─────────────────────────────────────────────────
    if (action === "play-pick") {
      const searchId = parts[1];
      const idx      = parseInt(parts[2]);
      const cached   = searchCache.get(searchId);

      if (!cached)
        return i.reply({ content: "❌ Поиск устарел, введи /play заново", ephemeral: true });

      const track = cached.results[idx];
      const voiceChannel = i.member?.voice?.channel;
      if (!voiceChannel)
        return i.reply({ content: "❌ Зайди в войс-канал!", ephemeral: true });

      await i.deferUpdate();

      const m = getMusic(i.guildId);

      // Подключаемся к каналу если ещё не подключены
      if (!m.connection || m.connection.state.status === VoiceConnectionStatus.Destroyed) {
        m.connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId:   i.guildId,
          adapterCreator: i.guild.voiceAdapterCreator
        });

        m.player = createAudioPlayer();
        m.connection.subscribe(m.player);

        // Когда трек заканчивается — включаем следующий
        m.player.on(AudioPlayerStatus.Idle, () => playNext(i.guildId));

        m.player.on("error", err => {
          console.error("Player error:", err);
          playNext(i.guildId);
        });
      }

      // Добавляем в очередь
      m.queue.push(track);

      // Если сейчас ничего не играет — сразу запускаем
      if (!m.current) {
        await playNext(i.guildId);
        await i.editReply({
          content: `▶️ Играю: **${track.title}**`,
          embeds: [],
          components: []
        });
      } else {
        await i.editReply({
          content: `➕ Добавлено в очередь: **${track.title}**`,
          embeds: [],
          components: []
        });
      }

      searchCache.delete(searchId);
      return;
    }

    // ── Капт кнопки (всё остальное как было) ─────────────────────────────────
    const captId   = parts[1];
    const targetId = parts[2];

    const c = data[captId];
    if (!c) return i.reply({ content: "Капт не найден", ephemeral: true });

    const canManage = c.owner === i.user.id || c.admins.includes(i.user.id);

    if (action === "join") {
      if (c.closed)
        return i.reply({ content: "Капт закрыт 🔒", ephemeral: true });
      if (c.users.includes(i.user.id) || c.reserves.includes(i.user.id))
        return i.reply({ content: "Вы уже в списке", ephemeral: true });
      c.users.push(i.user.id);
      save();
      await refresh(c);
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
      await refresh(c);
      return i.reply({ content: "Вы вышли из списка", ephemeral: true });
    }

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

    if (action === "adduser") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      const m = new ModalBuilder().setCustomId(`modal-adduser:${captId}`).setTitle("Добавить участника");
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("val").setLabel("ID пользователя")
          .setPlaceholder("Вставьте числовой ID (ПКМ → Копировать ID)")
          .setStyle(TextInputStyle.Short).setRequired(true)
      ));
      return i.showModal(m);
    }

    if (action === "addadmin") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      const m = new ModalBuilder().setCustomId(`modal-addadmin:${captId}`).setTitle("Добавить админа");
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("val").setLabel("ID пользователя")
          .setPlaceholder("Вставьте числовой ID (ПКМ → Копировать ID)")
          .setStyle(TextInputStyle.Short).setRequired(true)
      ));
      return i.showModal(m);
    }

    if (action === "deluser") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      const all = [...c.users, ...c.reserves];
      if (!all.length) return i.reply({ content: "Список пуст", ephemeral: true });
      await i.deferReply({ ephemeral: true });
      await i.guild.members.fetch().catch(() => {});
      const rows = buildPickerRows("pick-del", captId, all, i.guild);
      return i.editReply({ content: "Выберите кого убрать:", components: rows });
    }

    if (action === "tomreserve") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      if (!c.users.length) return i.reply({ content: "Основной список пуст", ephemeral: true });
      await i.deferReply({ ephemeral: true });
      await i.guild.members.fetch().catch(() => {});
      const rows = buildPickerRows("pick-reserve", captId, c.users, i.guild);
      return i.editReply({ content: "Кого переместить в замену?", components: rows });
    }

    if (action === "deladmin") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      if (!c.admins.length) return i.reply({ content: "Нет админов", ephemeral: true });
      await i.deferReply({ ephemeral: true });
      await i.guild.members.fetch().catch(() => {});
      const rows = buildPickerRows("pick-deladmin", captId, c.admins, i.guild);
      return i.editReply({ content: "Кого убрать из админов?", components: rows });
    }

    if (action === "pick-del") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      c.users    = c.users.filter(x => x !== targetId);
      c.reserves = c.reserves.filter(x => x !== targetId);
      save();
      await refresh(c);
      return i.reply({ content: `✅ <@${targetId}> удалён из списка`, ephemeral: true });
    }

    if (action === "pick-reserve") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      if (!c.users.includes(targetId))
        return i.reply({ content: "Пользователь не найден в основном списке", ephemeral: true });
      c.users    = c.users.filter(x => x !== targetId);
      c.reserves = c.reserves.filter(x => x !== targetId);
      c.reserves.push(targetId);
      save();
      await refresh(c);
      return i.reply({ content: `🔄 <@${targetId}> перемещён в замену`, ephemeral: true });
    }

    if (action === "pick-deladmin") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      c.admins = c.admins.filter(x => x !== targetId);
      save();
      await refresh(c);
      return i.reply({ content: `✅ <@${targetId}> убран из админов`, ephemeral: true });
    }

    if (action === "thread") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      if (c.threadId) return i.reply({ content: "❌ Ветка уже создана", ephemeral: true });
      const m = new ModalBuilder().setCustomId(`modal-thread:${captId}`).setTitle("Создание ветки");
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("val").setLabel("Название ветки")
          .setPlaceholder("Например: Капт 20:00")
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
      ));
      return i.showModal(m);
    }

    if (action === "toggle") {
      if (!canManage) return i.reply({ content: "Нет прав", ephemeral: true });
      c.closed = !c.closed;
      save();
      await refresh(c);
      return i.reply({ content: `Капт теперь ${c.closed ? "закрыт 🔒" : "открыт 🔓"}`, ephemeral: true });
    }

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
    const action = parts[0];
    const captId = parts[1];
    const c      = data[captId];
    if (!c) return i.reply({ content: "Капт не найден", ephemeral: true });

    const val = i.fields.getTextInputValue("val").trim();

    if (action === "modal-title") {
      c.title = val; save(); await refresh(c);
      return i.reply({ content: "✅ Название обновлено", ephemeral: true });
    }

    if (action === "modal-time") {
      c.date = val; save(); await refresh(c);
      return i.reply({ content: "✅ Время обновлено", ephemeral: true });
    }

    if (action === "modal-adduser") {
      const uid = val.replace(/\D/g, "");
      if (!uid) return i.reply({ content: "❌ Введите числовой ID пользователя", ephemeral: true });
      if (c.users.includes(uid) || c.reserves.includes(uid))
        return i.reply({ content: "Этот пользователь уже в списке", ephemeral: true });
      c.users.push(uid); save(); await refresh(c);
      return i.reply({ content: `✅ <@${uid}> добавлен в список`, ephemeral: true });
    }

    if (action === "modal-addadmin") {
      const uid = val.replace(/\D/g, "");
      if (!uid) return i.reply({ content: "❌ Введите числовой ID пользователя", ephemeral: true });
      if (!c.admins.includes(uid)) c.admins.push(uid);
      save(); await refresh(c);
      return i.reply({ content: `✅ <@${uid}> добавлен как админ`, ephemeral: true });
    }

    if (action === "modal-thread") {
      if (c.threadId) return i.reply({ content: "❌ Ветка уже существует", ephemeral: true });
      const threadChannel = await client.channels.fetch(c.channelId).catch(() => null);
      if (!threadChannel) return i.reply({ content: "Не удалось найти канал капта", ephemeral: true });
      const msg = await threadChannel.messages.fetch(c.messageId).catch(() => null);
      if (!msg) return i.reply({ content: "Не удалось найти сообщение капта", ephemeral: true });
      const thread = await msg.startThread({ name: val, autoArchiveDuration: 1440 }).catch(() => null);
      if (!thread) return i.reply({ content: "Не удалось создать ветку", ephemeral: true });
      c.threadId = thread.id; save();
      const allIds = [...c.users, ...c.reserves];
      if (allIds.length)
        await thread.send(`👥 Участники капта: ${allIds.map(u => `<@${u}>`).join(" ")}`).catch(() => {});
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
    .addStringOption(o => o.setName("дата").setDescription("Дата и время").setRequired(true)),

  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Найти и включить музыку (YouTube / SoundCloud)")
    .addStringOption(o => o.setName("запрос").setDescription("Название песни или исполнитель").setRequired(true)),

  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Пропустить текущий трек"),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Остановить музыку и выйти из канала"),

  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Показать очередь воспроизведения")
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  await client.login(TOKEN);
})();
