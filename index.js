// index.js
// Capture Bot Discord.js v14
// Added:
// - Add/remove admins
// - Add/remove participants manually
// - Edit title/time/limit
// - Open/close capture
// - Delete capture
// - Auto embed refresh

const {
Client, GatewayIntentBits, EmbedBuilder,
ActionRowBuilder, ButtonBuilder, ButtonStyle,
ModalBuilder, TextInputBuilder, TextInputStyle,
SlashCommandBuilder, REST, Routes, Events
} = require("discord.js");
const fs = require("fs");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const client = new Client({ intents:[GatewayIntentBits.Guilds] });

let data = {};
if(fs.existsSync("data.json")){
 data = JSON.parse(fs.readFileSync("data.json","utf8"));
}

function save(){
 fs.writeFileSync("data.json",JSON.stringify(data,null,2));
}

function makeEmbed(c){
 const admins = c.admins.length
  ? c.admins.map(x=>`<@${x}>`).join(", ")
  : "Нет";

 const users = c.users.length
  ? c.users.map((u,i)=>`${i+1}. <@${u}>`).join("\n")
  : "Пока никто не записался";

 return new EmbedBuilder()
 .setColor("#5865F2")
 .setTitle(`🎯 ${c.title}`)
 .setDescription(users)
 .addFields(
  {name:"📅 Время",value:c.date,inline:true},
  {name:"👥 Участники",value:`${c.users.length}/${c.max}`,inline:true},
  {name:"📊 Статус",value:c.closed?"Закрыт":"Открыт",inline:true},
  {name:"🛡 Админы",value:admins}
 )
 .setTimestamp();
}

function mainRow(id){
 return new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`join_${id}`).setLabel("✅ Записаться").setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`leave_${id}`).setLabel("❌ Покинуть").setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId(`manage_${id}`).setLabel("⚙ Управление").setStyle(ButtonStyle.Primary)
 );
}

async function refresh(msg,c){
 await msg.edit({
  embeds:[makeEmbed(c)],
  components:[mainRow(c.id)]
 });
}

client.once(Events.ClientReady,()=>console.log("READY"));

client.on(Events.InteractionCreate, async i=>{

 if(i.isChatInputCommand() && i.commandName==="капт"){
  const id = Date.now().toString();

  data[id]={
   id,
   owner:i.user.id,
   admins:[],
   users:[],
   title:i.options.getString("название"),
   date:i.options.getString("дата"),
   max:i.options.getInteger("колво"),
   closed:false,
   threadId:null
  };

  const msg = await i.reply({
   embeds:[makeEmbed(data[id])],
   components:[mainRow(id)],
   fetchReply:true
  });

  data[id].messageId = msg.id;
  save();
 }

 if(i.isButton()){

  const [action,id] = i.customId.split("_");
  const c = data[id];
  if(!c) return;

  if(action==="join"){
   if(c.closed) return i.reply({content:"Капт закрыт",ephemeral:true});
   if(c.users.includes(i.user.id))
    return i.reply({content:"Вы уже записаны",ephemeral:true});

   c.users.push(i.user.id);
   save();
   await refresh(i.message,c);
   return i.reply({content:"Записаны",ephemeral:true});
  }

  if(action==="leave"){
   c.users = c.users.filter(x=>x!==i.user.id);
   save();
   await refresh(i.message,c);
   return i.reply({content:"Вы вышли",ephemeral:true});
  }

  const canManage = c.owner===i.user.id || c.admins.includes(i.user.id);

  if(action==="manage"){
   if(!canManage) return i.reply({content:"Нет прав",ephemeral:true});

   const r1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`title_${id}`).setLabel("Название").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`time_${id}`).setLabel("Время").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`limit_${id}`).setLabel("Лимит").setStyle(ButtonStyle.Primary)
   );

   const r2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`addadmin_${id}`).setLabel("➕ Админ").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`deladmin_${id}`).setLabel("➖ Админ").setStyle(ButtonStyle.Danger)
   );

   const r3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`adduser_${id}`).setLabel("➕ Участник").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`deluser_${id}`).setLabel("➖ Участник").setStyle(ButtonStyle.Danger)
   );

   const r4 = new ActionRowBuilder().addComponents(
 new ButtonBuilder()
  .setCustomId(`thread_${id}`)
  .setLabel("🧵 Ветка")
  .setStyle(ButtonStyle.Primary),

 new ButtonBuilder()
  .setCustomId(`toggle_${id}`)
  .setLabel("Открыть/Закрыть")
  .setStyle(ButtonStyle.Secondary),

 new ButtonBuilder()
  .setCustomId(`delete_${id}`)
  .setLabel("Удалить")
  .setStyle(ButtonStyle.Danger)
);

   return i.reply({content:"Панель управления",components:[r1,r2,r3,r4],ephemeral:true});
  }

  const modalActions = ["title","time","limit","addadmin","deladmin","adduser","deluser"];

  if(modalActions.includes(action)){
   const labels = {
    title:"Новое название",
    time:"Новое время",
    limit:"Новый лимит",
    addadmin:"ID пользователя",
    deladmin:"ID пользователя",
    adduser:"ID пользователя",
    deluser:"ID пользователя"
   };

   const m = new ModalBuilder()
    .setCustomId(`${action}m_${id}`)
    .setTitle("Редактирование");

   m.addComponents(
    new ActionRowBuilder().addComponents(
     new TextInputBuilder()
      .setCustomId("value")
      .setLabel(labels[action])
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
    )
   );

   return i.showModal(m);
  }
  
if(action==="thread"){

 if(c.threadId){
  return i.reply({
   content:"❌ Ветка уже создана",
   ephemeral:true
  });
 }

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
  
  if(action==="toggle"){
   c.closed=!c.closed;
   save();
   await refresh(i.message,c);
   return i.reply({content:"Статус изменён",ephemeral:true});
  }

  if(action==="delete"){
   if(i.user.id!==c.owner)
    return i.reply({content:"Только владелец",ephemeral:true});

   delete data[id];
   save();
   await i.message.delete().catch(()=>{});
   return i.reply({content:"Удалено",ephemeral:true});
  }
 }

 if(i.isModalSubmit()){

  const value = i.fields.getTextInputValue("value");
  const [action,id] = i.customId.split("_");
  const c = data[id];
  if(!c) return;

  const value = i.fields.getTextInputValue("value");

  if(action==="titlem") c.title=value;

  if(action==="timem") c.date=value;

  if(action==="limitm"){
   const n = parseInt(value);
   if(isNaN(n))
    return i.reply({content:"Введите число",ephemeral:true});
   c.max=n;
  }

  if(action==="addadminm"){
   if(!c.admins.includes(value))
    c.admins.push(value);
  }

  if(action==="deladminm"){
   c.admins = c.admins.filter(x=>x!==value);
  }

  if(action==="adduserm"){
   if(!c.users.includes(value))
    c.users.push(value);
  }

  if(action==="deluserm"){
   c.users = c.users.filter(x=>x!==value);
  }

if(action==="threadm"){

 if(c.threadId){
  return i.reply({
   content:"❌ Ветка уже существует",
   ephemeral:true
  });
 }

 const threadName =
  i
  
  save();

  const msg = await i.channel.messages.fetch(c.messageId).catch(()=>null);
  if(msg) await refresh(msg,c);

  return i.reply({content:"Сохранено",ephemeral:true});
 }
});

const commands = [
 new SlashCommandBuilder()
 .setName("капт")
 .setDescription("Создать капт")
 .addStringOption(o=>o.setName("название").setDescription("Название").setRequired(true))
 .addStringOption(o=>o.setName("дата").setDescription("Дата").setRequired(true))
 .addIntegerOption(o=>o.setName("колво").setDescription("Лимит").setRequired(true))
];

const rest = new REST({version:"10"}).setToken(TOKEN);

(async()=>{
 await rest.put(
  Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),
  {body:commands}
 );
 await client.login(TOKEN);
})();
