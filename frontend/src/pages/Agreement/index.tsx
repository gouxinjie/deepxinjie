/**
 * @component AgreementPage
 * @description 用户协议 / 隐私政策展示页，通过路由参数 type 区分（user=用户协议，privacy=隐私政策）；该页面为公开页面，不依赖登录态
 * @author gouxinjie
 * @created 2026-07-30
 * @updated 2026-07-30
 */
import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import styles from './index.module.scss';

/** 工信部备案号（合规展示，固定常量） */
const ICP_RECORD_NUMBER = '沪ICP备2026024942号';
/** 协议最近更新日期 */
const LAST_UPDATED = '2026 年 7 月 30 日';

/**
 * 协议章节结构。
 */
interface AgreementSection {
  /** 章节标题 */
  heading: string;
  /** 章节段落列表（支持多段） */
  paragraphs: string[];
}

/**
 * 协议文档结构。
 */
interface AgreementDoc {
  /** 文档主标题 */
  title: string;
  /** 文档引言 */
  intro: string;
  /** 章节列表 */
  sections: AgreementSection[];
}

/** 用户协议内容（通用合规模板） */
const USER_AGREEMENT: AgreementDoc = {
  title: 'DeepXinjie 用户协议',
  intro:
    '欢迎使用 DeepXinjie（以下简称"本服务"）。在使用本服务前，请您务必仔细阅读并透彻理解本协议的全部内容，特别是以粗体标识的免责或限制责任条款。如您未满 18 周岁，请在法定监护人的陪同下阅读。一旦您注册、登录或使用本服务，即视为您已阅读、理解并同意接受本协议约束。',
  sections: [
    {
      heading: '一、协议范围',
      paragraphs: [
        '本协议是您与本服务运营方之间关于使用本服务所订立的契约。',
        '本服务可能不时推出新的功能、产品或服务，如该等新内容无独立协议，则同样适用本协议。',
      ],
    },
    {
      heading: '二、账号注册与安全',
      paragraphs: [
        '您应提供真实、合法、有效的注册信息，并对账号下的所有活动承担责任。',
        '请您妥善保管账号与密码，因账号保管不善导致的损失由您自行承担。如发现有他人盗用，请立即通知我们。',
      ],
    },
    {
      heading: '三、使用规范',
      paragraphs: [
        '您承诺不利用本服务制作、发布、传播违反法律法规或公序良俗的信息，包括但不限于色情、赌博、暴力、煽动民族仇恨等内容。',
        '您不得对本服务进行反向工程、破解、抓取或用于任何商业牟利目的，不得干扰本服务的正常运行。',
      ],
    },
    {
      heading: '四、知识产权',
      paragraphs: [
        '本服务及其相关技术、界面的知识产权均归运营方所有，受法律保护。',
        '您在使用本服务过程中生成的内容，其知识产权由您依法享有，但您授予本服务为提供、改进服务而必要的使用权。',
      ],
    },
    {
      heading: '五、免责声明',
      paragraphs: [
        '本服务按"现状"提供，运营方不保证服务不间断或无错误，但因运营方故意或重大过失导致的除外。',
        '您因使用本服务而与第三方产生的纠纷，由您与第三方自行解决，运营方不承担责任。',
      ],
    },
    {
      heading: '六、协议的变更',
      paragraphs: [
        '运营方有权根据法律法规变化或业务调整不时修订本协议，修订后的协议将通过本页面公示。',
        '如您继续使用本服务，即视为接受修订后的协议。',
      ],
    },
    {
      heading: '七、联系我们',
      paragraphs: [
        '如您对本协议有任何疑问，可通过本服务内的反馈渠道与我们联系。',
        `本服务备案号：${ICP_RECORD_NUMBER}。`,
      ],
    },
  ],
};

/** 隐私政策内容（通用合规模板） */
const PRIVACY_POLICY: AgreementDoc = {
  title: 'DeepXinjie 隐私政策',
  intro:
    '我们非常重视您的隐私保护。本政策向您说明我们如何收集、使用、存储与保护您的个人信息。请您在使用本服务前仔细阅读本政策。一旦您使用本服务，即表示您已理解并同意我们按本政策处理您的信息。',
  sections: [
    {
      heading: '一、我们收集的信息',
      paragraphs: [
        '账号信息：您注册时提供的手机号、昵称等。',
        '使用信息：您与 AI 的对话内容、功能开关偏好等，用于为您提供对话服务与持续改进体验。',
      ],
    },
    {
      heading: '二、信息的使用',
      paragraphs: [
        '我们使用上述信息为您提供、维护并改进本服务，例如生成对话回复、保存历史记录。',
        '在获得您单独同意或法律法规要求的情况下，我们才会将信息用于其他目的。',
      ],
    },
    {
      heading: '三、信息的共享与披露',
      paragraphs: [
        '我们不会向第三方出售您的个人信息。',
        '仅在以下情形我们可能共享信息：获得您明确同意；为履行法定义务；为保护本服务及用户的合法权益所必需。',
      ],
    },
    {
      heading: '四、信息的存储与保护',
      paragraphs: [
        '我们在中华人民共和国境内存储您的个人信息，并采取加密等合理措施保护信息安全。',
        '我们仅在为实现本政策目的所必需的最短时间内保留您的信息。',
      ],
    },
    {
      heading: '五、您的权利',
      paragraphs: [
        '您有权查询、更正、删除您的个人信息，并可在符合规定的情形下撤回同意或注销账号。',
        '如您行使上述权利，可通过本服务内反馈渠道向我们提出请求。',
      ],
    },
    {
      heading: '六、Cookie 与同类技术',
      paragraphs: [
        '为维持登录态与提升体验，本服务会使用 Cookie 等同类技术，您可通过浏览器设置管理相关偏好。',
      ],
    },
    {
      heading: '七、未成年人保护',
      paragraphs: [
        '我们重视未成年人信息保护，不满 14 周岁的未成年人在使用本服务前应取得其监护人的同意。',
      ],
    },
    {
      heading: '八、联系我们',
      paragraphs: [
        `如您对个人信息处理有任何疑问，可通过本服务内反馈渠道联系我们。本服务备案号：${ICP_RECORD_NUMBER}。`,
      ],
    },
  ],
};

const AgreementPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // 读取协议类型参数，默认展示用户协议
  const type = searchParams.get('type');
  const doc = useMemo<AgreementDoc>(
    () => (type === 'privacy' ? PRIVACY_POLICY : USER_AGREEMENT),
    [type],
  );

  /**
   * 返回上一页，无历史记录时回到首页。
   */
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <button type="button" className={styles.backButton} onClick={handleBack} aria-label="返回">
          <ArrowLeft size={18} />
        </button>
        <span className={styles.topTitle}>{doc.title}</span>
      </header>

      <main className={styles.container}>
        <h1 className={styles.docTitle}>{doc.title}</h1>
        <p className={styles.meta}>最近更新日期：{LAST_UPDATED}</p>
        <p className={styles.paragraph}>{doc.intro}</p>

        {doc.sections.map((section) => (
          <section key={section.heading} className={styles.section}>
            <h2 className={styles.sectionTitle}>{section.heading}</h2>
            {section.paragraphs.map((text, index) => (
              <p key={index} className={styles.paragraph}>
                {text}
              </p>
            ))}
          </section>
        ))}
      </main>

      <footer className={styles.footer}>
        <span>{ICP_RECORD_NUMBER}</span>
        <button
          type="button"
          className={styles.footerLink}
          onClick={() => navigate('/agreement?type=user')}
        >
          用户协议
        </button>
        <button
          type="button"
          className={styles.footerLink}
          onClick={() => navigate('/agreement?type=privacy')}
        >
          隐私政策
        </button>
      </footer>
    </div>
  );
};

export default AgreementPage;
