// 题库：英语完形填空 / 语文阅读理解（含篇章）+ 英语、语文基础题
window.PASSAGES = {
  en1: {
    title: "完形填空 · A Lost Bike",
    from: "自编短文（初中词汇）",
    text: "Tom was thirteen when he got his first bike. He rode it to school every day and never left it outside without locking（锁）it. One Friday, however, he was in a hurry and ___1___ his bike near the shop without a lock. Twenty minutes later, it was ___2___. Tom looked everywhere but found nothing. He felt so ___3___ that he almost cried. Just then, an old man came up and asked what had happened. Tom told him the whole story. The old man said nothing, took out his phone, and ten minutes later Tom saw his bike again — the man's grandson had ___4___ it on the road and brought it to the police station nearby. Tom wanted to give the man some money to show his thanks, but the old man ___5___ with a smile. “Helping others is the happiest thing in life,” he said. Tom has never forgotten those words. He now locks his bike, and he also helps others when they are in ___6___."
  },
  en2: {
    title: "完形填空 · A Letter Home",
    from: "自编书信（初中词汇）",
    text: "Dear Mum and Dad,\nI am writing this letter from the countryside. Last week I came here with my classmates for a summer camp. I was nervous before the trip because I had never ___1___ away from home for so long. On the first day we had to put up our own tents. Nobody taught us, so we made lots of ___2___ and our tent fell down twice. I was ___3___ with myself, but my partner Li Ming said, “It's OK. We can try again.” ___4___ we did it together and the tent stood all night.\nEvery morning we walk to the river and back. The air here is clean and fresh, and at night I can see many stars, which I can never see in the ___5___. I have learned to wash my own clothes and to share the work with others. I miss your cooking, but I am also ___6___ of myself.\nDon't worry about me. I will be back on Saturday, and I have a lot of stories to ___7___ you."
  },
  cn1: {
    title: "阅读理解 · 《父亲的扁担》（节选）",
    from: "原创应试语段",
    text: "父亲的扁担是樟木的，被岁月磨得发亮，两头各拴一只竹筐。\n那年我考上县城的高中，学费凑不齐，父亲便挑着扁担，走三十里山路，把自家的红薯和鸡蛋送到集市上。我放假回家，母亲说：“你父亲天不亮就出门了，怕你看见他走那条小路。”我愣住——父亲是怕我知道他卖了多少斤红薯，怕我在他面前露出愧色。\n傍晚他回来，扁担两头空了，脚步却比来时轻。他把一沓毛票在衣角上抚平，一张一张数完，用粗糙的拇指蘸着唾沫，数了两遍。然后他从筐底摸出一个纸包，打开，是两个还带着体温的橘子。\n“集市上买的，甜。”他说。可我分明看见，他鞋帮上还沾着山路的黄泥。\n后来我读大学、工作、进城，父亲的扁担一直靠在老屋门后。有一年我回家，看见他坐在扁担旁，用砂纸打磨那道磨破的漆，一边磨一边说：“这担子压过我，也养过你们。”\n扁担弯弯的，像父亲一生的姿势——低着头，往前走，一声不响，却把整个家挑过了最难的年月。"
  },
  cn2: {
    title: "阅读理解 · 《会走路的声音》（节选）",
    from: "原创应试语段",
    text: "小区门口有位修鞋的老人，耳朵有些聋。他坐在小马扎上，手里握着锥子，眼睛盯着针脚，全神贯注的时候，谁叫他三声也听不见。\n我起初以为他冷漠。有回我拿着脱胶的鞋去修，喊了两声他没抬头，我以为他故意不理人，语气就冲了些。他这才站起来，指了指耳朵，又指了指自己的鞋机，比划了半天，意思是：机器太响，听不见。\n他修鞋极慢，一针一线都要压实。我催他，他就从抽屉里摸出一张硬纸条递给我，上面是工工整整的铅笔字：“慢一点，才不会开。”\n后来每天路过，我都看见他低着头。他的鞋机“哒哒哒”地响，像一种固执的心跳。有人嫌他贵、嫌他慢，去路边换了新鞋；新鞋穿了一个月就开了胶，又拎回来找他。他从不说“早跟你讲过”这类话，只是接过来，重新压实。\n去年冬天，老人不见了。门口空出的那块地上，落满梧桐叶。我忽然发觉，那“哒哒哒”的声音其实是会走路的——它走得那样慢，以至于要等他消失很久，你才明白，自己曾经离它那样近。"
  }
};

window.QUESTIONS_LANG = [
  // ================= 英语 · 完形填空 A Lost Bike =================
  { s: "英语", l: 2, p: "en1", stem: "第 1 空：he was in a hurry and ___ his bike near the shop without a lock.", o: ["locked", "left", "bought", "cleaned"], a: 1, x: "leave sth＋地点，表示“把某物放在/落在某处”；与后文 without a lock 呼应。" },
  { s: "英语", l: 2, p: "en1", stem: "第 2 空：Twenty minutes later, it was ___.", o: ["broken", "broken down", "gone", "died"], a: 2, x: "be gone 表示“不见了、没了”；broken 需先出现损坏情节，文中是车不见了。" },
  { s: "英语", l: 3, p: "en1", stem: "第 3 空：He felt so ___ that he almost cried.", o: ["angry", "tired", "sad", "proud"], a: 2, x: "“几乎要哭出来”对应情绪是难过（sad）。" },
  { s: "英语", l: 3, p: "en1", stem: "第 4 空：the man's grandson had ___ it on the road and brought it to the police station.", o: ["seen", "hidden", "repaired", "sold"], a: 0, x: "see 的过去分词 seen：“在路上看见了车并送到派出所”，逻辑通顺。" },
  { s: "英语", l: 3, p: "en1", stem: "第 5 空：Tom wanted to give the man some money, but the old man ___ with a smile.", o: ["accepted", "refused", "cried", "asked"], a: 1, x: "but 表转折，老人笑着“拒绝”酬谢，才与后文“助人最快乐”一致。" },
  { s: "英语", l: 4, p: "en1", stem: "第 6 空：he also helps others when they are in ___.", o: ["trouble", "danger", "line", "love"], a: 0, x: "in trouble 是固定搭配，“处于困难中”。" },
  { s: "英语", l: 4, p: "en1", kind: "read", stem: "【篇章理解】下列对短文主旨概括最准确的是？", o: ["丢了自行车要马上报警", "接受帮助，并把帮助传递给别人", "锁车比什么都重要", "老人喜欢打电话"], a: 1, x: "Tom 被帮助后也开始帮助别人，主旨是善意的传递。" },

  // ================= 英语 · 完形填空 A Letter Home =================
  { s: "英语", l: 2, p: "en2", stem: "第 1 空：I had never ___ away from home for so long.", o: ["stayed", "kept", "lived", "worked"], a: 0, x: "stay away from home“离家在外”；过去完成时 had never stayed。" },
  { s: "英语", l: 3, p: "en2", stem: "第 2 空：we made lots of ___ and our tent fell down twice.", o: ["food", "mistakes", "friends", "money"], a: 1, x: "make mistakes“犯错”，与帐篷两次倒塌相照应。" },
  { s: "英语", l: 3, p: "en2", stem: "第 3 空：I was ___ with myself.", o: ["pleased", "angry", "careful", "strict"], a: 1, x: "be angry with sb“生某人的气”，搭配正确。" },
  { s: "英语", l: 4, p: "en2", stem: "第 4 空：___ we did it together and the tent stood all night.", o: ["So", "But", "Or", "Yet"], a: 0, x: "上文是“我们可以再试一次”，因此（So）我们一起做到了，表结果。" },
  { s: "英语", l: 4, p: "en2", stem: "第 5 空：I can see many stars, which I can never see in the ___.", o: ["sky", "city", "country", "forest"], a: 1, x: "与乡村对比：在城市（city）里从来看不到这么多星星。" },
  { s: "英语", l: 4, p: "en2", stem: "第 6 空：I miss your cooking, but I am also ___ of myself.", o: ["afraid", "proud", "tired", "sure"], a: 1, x: "be proud of“为……自豪”，but 转折后是积极情绪。" },
  { s: "英语", l: 5, p: "en2", stem: "第 7 空：I have a lot of stories to ___ you.", o: ["say", "speak", "tell", "talk"], a: 2, x: "tell sb stories 是固定搭配；say 后接内容，speak 后接语言，talk 需加 to。" },
  { s: "英语", l: 5, p: "en2", kind: "read", stem: "【篇章理解】写这封信的最主要目的是？", o: ["向父母道歉", "报告 camp 的费用", "分享成长并让父母放心", "请求父母寄衣服"], a: 2, x: "信里写自立与合作，结尾说 Don't worry about me，是分享成长、安慰父母。" },

  // ================= 语文 · 《父亲的扁担》 =================
  { s: "语文", l: 2, p: "cn1", kind: "read", stem: "母亲说“你父亲天不亮就出门了，怕你看见他走那条小路”。父亲这样做的原因是？", o: ["山路太黑，走路不方便", "怕儿子知道他卖了多少斤红薯而心生愧疚", "想多卖一些红薯", "母亲让他先走"], a: 1, x: "父亲怕儿子露出愧色，是呵护孩子自尊的表现。" },
  { s: "语文", l: 3, p: "cn1", kind: "read", stem: "“他把一沓毛票在衣角上抚平……数了两遍。”对这一细节理解不恰当的是？", o: ["说明钱很少，每一张都珍贵", "表现父亲的节俭与辛苦", "两次数钱体现学费凑得不易", "表明父亲对儿子花钱不满"], a: 3, x: "细节写的是钱的来之不易与珍重，并无对儿子的不满。" },
  { s: "语文", l: 3, p: "cn1", kind: "read", stem: "“集市上买的，甜。”可“我”分明看见他鞋帮上沾着黄泥。这一描写的作用是？", o: ["说明集市离家很近", "父亲善意地撒谎，橘子其实是自家留下的，写出深沉的父爱", "表现父亲走路小心", "突出天气炎热"], a: 1, x: "“谎言”与黄泥互相矛盾，正显出父亲把好东西留给孩子的爱。" },
  { s: "语文", l: 4, p: "cn1", kind: "read", stem: "结尾“扁担弯弯的，像父亲一生的姿势”赏析正确的是？", o: ["运用比喻，把扁担的形状与父亲隐忍担当的一生联系起来", "运用夸张，说明扁担很重", "运用设问，引起读者思考", "运用排比，增强语言气势"], a: 0, x: "“像……姿势”是比喻，形神合一，收束全篇。" },
  { s: "语文", l: 4, p: "cn1", kind: "read", stem: "“这担子压过我，也养过你们”的含义是？", o: ["扁担太重，把父亲压垮了", "生活的艰辛磨砺了父亲，也养育了子女", "父亲后悔挑了扁担", "家中只有父亲一人劳动"], a: 1, x: "担子既是实物也是生活重压，“压”与“养”对举，写苦中有价值。" },
  { s: "语文", l: 5, p: "cn1", kind: "read", stem: "下列对文章线索与写法分析最恰当的是？", o: ["以“扁担”为线索，串起卖薯、数钱、打磨等场景，托物言志", "标题是比喻，实际写的是挑水", "全文采用时间倒序", "主要通过大量对话推动情节"], a: 0, x: "扁担贯穿全文，围绕这一物组织材料，寄托情感与思考。" },

  // ================= 语文 · 《会走路的声音》 =================
  { s: "语文", l: 3, p: "cn2", kind: "read", stem: "“我”起初以为老人冷漠，是因为？", o: ["老人不愿修鞋", "喊了两声老人没抬头", "老人要价太高", "老人把鞋修坏了"], a: 1, x: "老人耳聋、鞋机太响才没听见，“我”误读为冷漠。" },
  { s: "语文", l: 3, p: "cn2", kind: "read", stem: "纸条上“慢一点，才不会开”在文中的作用是？", o: ["解释修鞋速度慢的原因", "既写手艺态度，也暗含做人做事要扎实的道理", "批评顾客催促", "引出老人消失的下文"], a: 1, x: "语带双关：一层是针脚要压实，一层是踏实不苟且的做人姿态。" },
  { s: "语文", l: 4, p: "cn2", kind: "read", stem: "老人从不说“早跟你讲过”这类话，表现了他怎样的品格？", o: ["自卑怯懦", "宽厚、不计较、少说多做", "精明会做生意", "冷漠寡言"], a: 1, x: "面对回头客不数落、不邀功，显出厚道与沉默的尊严。" },
  { s: "语文", l: 4, p: "cn2", kind: "read", stem: "对标题“会走路的声音”理解最准确的是？", o: ["鞋机的声音很响，传出很远", "老人挑着担子四处走动修鞋", "那声音一直陪伴生活，直到失去才被察觉，暗指平凡而珍贵的陪伴", "声音像人一样有生命，是想象写法"], a: 2, x: "结尾点明声音“会走路”——它一直在，只是“我”不曾留意，等它消失才懂得。" },
  { s: "语文", l: 5, p: "cn2", kind: "read", stem: "结尾写“门口空出的那块地上，落满梧桐叶”，其作用不包括？", o: ["以景写情，暗示老人已离去", "空寂画面表现“我”的怅惘", "与前文“哒哒哒”的声响形成对照", "说明小区环境卫生很差"], a: 3, x: "落叶是抒情意象，与环境卫生无关。" },
  { s: "语文", l: 5, p: "cn2", kind: "read", stem: "下列对文章语言风格判断正确的是？", o: ["华丽铺陈，多用长句排比", "平实质朴，以细节和对话见真情", "幽默夸张，充满反语", "冷静客观，不带感情"], a: 1, x: "全文少堆砌形容词，靠动作、纸条、声音等细节传递情感。" },

  // ================= 英语 · 基础 =================
  { s: "英语", l: 1, stem: "与“图书馆里禁止吃东西”相符的表达是？", o: ["No eating in the library.", "Don't eat in the classroom.", "You can eat here.", "Eating is allowed."], a: 0, x: "No＋doing 表禁止；library 是图书馆。" },
  { s: "英语", l: 1, stem: "—How do you go to school?  —___ foot.", o: ["By", "On", "In", "With"], a: 1, x: "on foot 是固定搭配，“步行”。" },
  { s: "英语", l: 2, stem: "She ___ to the park every Sunday.", o: ["go", "goes", "going", "went"], a: 1, x: "一般现在时、第三人称单数，动词加 -es。" },
  { s: "英语", l: 2, stem: "下列单词画线部分读音与其他三个不同的是？", o: ["cake", "name", "cat", "late"], a: 2, x: "cat 中的 a 读 /æ/，其余读 /eɪ/。" },
  { s: "英语", l: 3, stem: "The teacher asked us to keep the classroom ___.", o: ["clean", "cleaning", "cleaned", "cleanliness"], a: 0, x: "keep＋宾语＋形容词作宾补，“让教室保持干净”。" },
  { s: "英语", l: 3, stem: "“他比班上其他任何一个学生都高”，正确表达是？", o: ["He is taller than any other student in his class.", "He is taller than any student in his class.", "He is the taller than other students.", "He is tallest than others."], a: 0, x: "比较级＋than any other＋单数名词；B 未排除自己，逻辑错。" },
  { s: "英语", l: 4, stem: "Neither of the answers ___ right.", o: ["are", "is", "were", "be"], a: 1, x: "neither of＋复数名词，谓语用单数。" },
  { s: "英语", l: 4, stem: "The book ___ I borrowed yesterday is very interesting.", o: ["what", "who", "that", "where"], a: 2, x: "先行词是物（the book），用 that/which 引导定语从句。" },
  { s: "英语", l: 5, stem: "下列句子语法正确的是？", o: ["He is one of the best student in our school.", "I look forward to see you.", "She is old enough to dress herself.", "There have many trees on the hill."], a: 2, x: "A 应为 students；B 应为 to seeing；D 应为 there are；C 正确。" },

  // ================= 语文 · 基础 =================
  { s: "语文", l: 1, stem: "“山重水复疑无路，柳暗花明又一村”的作者是？", o: ["杜甫", "陆游", "苏轼", "白居易"], a: 1, x: "出自陆游《游山西村》。" },
  { s: "语文", l: 2, stem: "下列词语中没有错别字的一项是？", o: ["迫不急待", "走头无路", "再接再厉", "谈笑风声"], a: 2, x: "应为“迫不及待”“走投无路”“谈笑风生”，只有 C 正确。" },
  { s: "语文", l: 2, stem: "“温故而知新”出自哪部经典？", o: ["《孟子》", "《论语》", "《大学》", "《庄子》"], a: 1, x: "《论语·为政》：“温故而知新，可以为师矣。”" },
  { s: "语文", l: 3, stem: "下列句子中成语使用恰当的一项是？", o: ["他做作业一丝不苟，从不检查，错误百出。", "他上课随声附和，独立思考，成绩进步很快。", "面对这道难题，他殚精竭虑，终于找到了解法。", "他俩形影不离，从不来往。"], a: 2, x: "殚精竭虑指用尽心思，与攻克难题相配；A、D 前后矛盾，B“随声附和”与“独立思考”矛盾。" },
  { s: "语文", l: 3, stem: "“他的笑声震得房子都要塌了”使用的修辞是？", o: ["比喻", "拟人", "夸张", "排比"], a: 2, x: "故意放大程度，是夸张。" },
  { s: "语文", l: 4, stem: "下列文学常识表述正确的一项是？", o: ["《西游记》的作者是罗贯中。", "《骆驼祥子》的作者是老舍，主人公是祥子。", "《朝花夕拾》是鲁迅的小说集。", "《水浒》中“倒拔垂杨柳”的是李逵。"], a: 1, x: "A 作者是吴承恩；C 是散文集；D 是鲁智深。" },
  { s: "语文", l: 4, stem: "修改病句：“通过这次活动，使我明白了团结的重要。”最恰当的改法是？", o: ["删去“通过”", "删去“使”", "把“明白”改为“了解”", "无需修改"], a: 1, x: "“通过……使……”造成主语缺失，删去“使”后主语为“我”。" },
  { s: "语文", l: 5, stem: "把句子排成一段连贯的文字：①它把根扎进石缝。②崖壁上有一棵松树。③于是它长得比山下的同类更硬、更慢，也更高。④风把种子吹到这里。", o: ["②④①③", "①②③④", "④①②③", "②①④③"], a: 0, x: "先总写松树，再写种子被吹来、扎根、成长，顺序为②④①③。" }
];
