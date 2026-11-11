// js/sentences-data.js — V135: CÂU MẪU của giáo trình (trước đây nằm trong js/data.js).
//
// Tách ra file riêng để DÙNG CHUNG:
//   * trình duyệt: tab "📖 Dịch câu" và dạng "🧩 Sắp xếp câu" đọc biến toàn cục `SENTENCES` (nạp TRƯỚC js/data.js);
//   * server (api/index.js): `require('../js/sentences-data')` để CHẤM câu sắp xếp — server không tin
//     câu do client gửi lên, câu đúng phải lấy từ chính file này (hoặc word_examples trong DB).
//
// Mỗi mục: { vi: nghĩa tiếng Việt, hz: câu chữ Hán, hint: các TỪ có trong câu (phân cách bằng 、),
//            l: bài học }. `hint` là danh sách từ CÓ THẬT được dùng để tìm câu chứa một từ cho trước
// (xem QE.findSentences / OS.fromSentences) — không phải bản dịch từng từ.
'use strict';

var SENTENCES = [
  {vi:'Buổi sáng tôi ăn bánh bao và uống súp.',hz:'早上我吃包子，喝汤。',hint:'早上、包子、汤',l:7},
  {vi:'Bạn muốn ăn cơm hay mì sợi?',hz:'你要吃米饭还是面条？',hint:'米饭、还是、面条',l:7},
  {vi:'Căng-tin của trường có cơm trắng và trứng gà.',hz:'学校的食堂有米饭和鸡蛋。',hint:'食堂、米饭、鸡蛋',l:7},
  {vi:'Buổi tối tôi thường uống một ít bia.',hz:'晚上我常常喝一些啤酒。',hint:'晚上、一些、啤酒',l:7},
  {vi:'Buổi sáng sớm anh ấy ăn mì sợi và uống sữa.',hz:'早上他吃面条，喝牛奶。',hint:'早上、面条',l:7},
  {vi:'Một cân táo bao nhiêu tiền?',hz:'苹果一斤多少钱？',hint:'苹果、斤、多少钱',l:8},
  {vi:'Hoa quả này không đắt, tất cả chỉ mười lăm đồng.',hz:'这些水果不贵，一共十五块。',hint:'水果、不贵、一共',l:8},
  {vi:'Chị ấy muốn mua quýt và táo.',hz:'她要买橘子和苹果。',hint:'橘子、苹果',l:8},
  {vi:'Tôi đưa cho anh một trăm đồng, anh thối lại tôi nhé.',hz:'我给你一百块，你找我钱吧。',hint:'给、找、吧',l:8},
  {vi:'Anh còn muốn mua gì khác không?',hz:'你还要买别的东西吗？',hint:'还、别的',l:8},
  {vi:'Buổi chiều tôi muốn đổi đô la Mỹ sang nhân dân tệ.',hz:'下午我要换美元成人民币。',hint:'下午、换、美元、人民币',l:9},
  {vi:'Thư viện đổi một nghìn yên Nhật được bao nhiêu nhân dân tệ?',hz:'图书馆换一千日元多少人民币？',hint:'图书馆、千、日元、人民币',l:9},
  {vi:'Ông ơi, một lúc nữa ông quay lại nhé, nhân viên đi ăn cơm rồi.',hz:'先生，一会儿您回来吧，营业员去吃饭了。',hint:'先生、一会儿、营业员',l:9},
  {vi:'Nhân viên văn phòng đó đang ở phòng 305 tòa nhà B.',hz:'那个办公室职员在B楼305号房间。',hint:'办公室、职员、楼、号、房间',l:10},
  {vi:'Bạn có biết số điện thoại di động của cô ấy không?',hz:'你知道她的手机号码吗？',hint:'知道、手机、号码',l:10},
  {vi:'Anh ấy không ở nhà, anh ấy đang làm việc ở văn phòng.',hz:'他不在家，他在办公室办公。',hint:'在家、办公室、办公',l:10},
  {vi:'Buổi sáng hôm nay, tôi trước tiên đi làm, sau đó cùng bạn bè đi nhà hàng Trung Quốc ăn cơm.',hz:'今天早上，我先去上班，然后跟朋友去中国餐厅吃饭。',hint:'先、然后、跟',l:11},
  {vi:'Để tôi giới thiệu một chút, vị này là giáo sư của chúng tôi.',hz:'我来介绍一下儿，这位是我们的教授。',hint:'介绍、一下儿、位、教授',l:11},
  {vi:'Hiệu trưởng nhiệt liệt hoan nghênh các bạn lưu học sinh mới đến trường.',hz:'校长热烈欢迎新来的留学生。',hint:'校长、欢迎、留学生',l:11},
  {vi:'Chúng tôi và họ đều là lưu học sinh, các bạn cũng là lưu học sinh phải không?',hz:'我们和他们都是留学生，你们也是留学生吧？',hint:'我们、他们、都、你们、也',l:11},
  {vi:'Hai người họ đều đang học tiếng Trung ở trường đại học này.',hz:'他们俩都在这所大学学习汉语。',hint:'俩、都、大学、学习',l:11},
  {vi:'Bạn cảm thấy ngữ pháp tiếng Hán thế nào, có khó không?',hz:'你觉得汉语语法怎么样，难不难？',hint:'觉得、语法、怎么样',l:12},
  {vi:'Nghe và nói tương đối dễ, nhưng đọc và viết khá khó.',hz:'听和说比较容易，但是读和写比较难。',hint:'听、说、比较、容易、但是、读、写',l:12},
  {vi:'Bạn cùng phòng mới của tôi là một du học sinh, anh ấy nói ngôn ngữ này rất tốt.',hz:'我的新同屋是留学生，他说这种语言说得很好。',hint:'新、同屋、留学生、语言',l:12},
  {vi:'Thầy giáo cho chúng tôi rất nhiều bài tập ngữ pháp.',hz:'老师给我们很多语法练习。',hint:'给、语法',l:12},
  {vi:'Bạn học của tôi nói rằng học ở trường đại học này rất vui.',hz:'我的同学说在这所大学学习很愉快。',hint:'同学、大学、学习',l:12},
];

if (typeof module !== 'undefined' && module.exports) module.exports = SENTENCES;
