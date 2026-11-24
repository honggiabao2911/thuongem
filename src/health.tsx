import { Activity, BatteryLow, Droplet, HeartPulse, Moon, Thermometer, TriangleAlert, Zap } from 'lucide-react'

export const quickHealthTopics = ['Đau đầu', 'Sốt ở người lớn', 'Mệt mỏi kéo dài'] as const

const topics = [
  {
    title: quickHealthTopics[0],
    icon: Zap,
    advice: 'Thử uống nước, ăn đúng bữa và nghỉ mắt khỏi màn hình. Ghi thời điểm bắt đầu, mức độ và triệu chứng đi kèm.',
    followUp: 'Nên đi khám nếu đau đầu tái diễn hoặc nặng dần. Đi cấp cứu nếu cơn đau xuất hiện đột ngột và dữ dội, hoặc kèm yếu liệt, khó nói, lú lẫn, sốt cao và cứng cổ.',
    url: 'https://www.nhs.uk/symptoms/headaches/',
    source: 'NHS · Đau đầu',
  },
  {
    title: quickHealthTopics[1],
    icon: Thermometer,
    advice: 'Có thể đo và ghi thân nhiệt. Ở người lớn, từ 38°C thường được coi là sốt. Nghỉ ngơi và uống đủ nước.',
    followUp: 'Liên hệ cơ sở y tế nếu sốt không giảm hoặc nặng hơn dù đã chăm sóc tại nhà.',
    url: 'https://www.nhs.uk/symptoms/fever-in-adults/',
    source: 'NHS · Sốt ở người lớn',
  },
  {
    title: quickHealthTopics[2],
    icon: BatteryLow,
    advice: 'Theo dõi giấc ngủ và thời gian thấy mệt. Thử giữ giờ ngủ đều và ăn uống cân bằng.',
    followUp: 'Nên đi khám nếu mệt không rõ lý do trong vài tuần hoặc mệt ảnh hưởng đến sinh hoạt.',
    url: 'https://www.nhs.uk/symptoms/tiredness-and-fatigue/',
    source: 'NHS · Mệt mỏi kéo dài',
  },
  {
    title: 'Đau bụng kinh',
    icon: Activity,
    advice: 'Thử tắm nước ấm, chườm ấm vùng bụng bằng túi chườm bọc khăn, hoặc đi bộ nhẹ nếu thấy dễ chịu. Ghi mức đau và thời điểm đau để theo dõi.',
    followUp: 'Liên hệ cơ sở y tế sớm nếu cơn đau nặng hơn bình thường và vẫn chưa dịu dù đã thử cách giảm đau thường dùng. Nếu đau làm gián đoạn học tập, công việc hoặc sinh hoạt, hãy đặt lịch khám.',
    url: 'https://www.nhs.uk/symptoms/period-pain/',
    source: 'NHS · Đau bụng kinh',
  },
  {
    title: 'Ra máu nhiều hoặc kéo dài',
    icon: Droplet,
    advice: 'Ghi số ngày ra máu và tần suất thay băng để có thông tin cụ thể khi đi khám.',
    followUp: 'Nên đặt lịch khám nếu thường xuyên phải thay băng hoặc tampon mỗi 1–2 giờ, kỳ ra máu kéo dài hơn 7 ngày, hoặc có ra máu giữa các kỳ.',
    url: 'https://www.nhs.uk/conditions/heavy-periods/',
    source: 'NHS · Kinh nguyệt ra nhiều',
  },
  {
    title: 'Mệt mỏi và khó ngủ trước kỳ',
    icon: Moon,
    advice: 'Thử dành đủ thời gian ngủ và vận động nhẹ theo sức. Nếu thấy triệu chứng lặp lại, bạn có thể ghi lại trong ít nhất hai chu kỳ để nhận ra thời điểm thường xuất hiện.',
    followUp: 'Nếu các triệu chứng ảnh hưởng đến sinh hoạt, hãy trao đổi với nhân viên y tế. Bạn có thể mang theo nhật ký nếu muốn.',
    url: 'https://www.nhs.uk/conditions/pre-menstrual-syndrome/',
    source: 'NHS · Triệu chứng trước kỳ kinh',
  },
  {
    title: 'Chu kỳ thay đổi hoặc đến trễ',
    icon: HeartPulse,
    advice: 'Kiểm tra ngày bắt đầu đã nhập và ghi lại những thay đổi gần đây. Ngày trên lịch chỉ là dự đoán.',
    followUp: 'Nên hỏi nhân viên y tế nếu chu kỳ thay đổi so với bình thường, thường xuyên không đều hoặc kèm triệu chứng khiến bạn lo lắng.',
    url: 'https://www.nhs.uk/symptoms/irregular-periods/',
    source: 'NHS · Chu kỳ không đều',
  },
]

export function HealthGuide({ selected }: { selected?: string }) {
  return <div className="stack health-guide">
    <p className="muted">Chọn triệu chứng để xem cách chăm sóc và thời điểm cần đi khám.</p>
    <section className="health-alert" aria-labelledby="urgent-care">
      <TriangleAlert size={21} aria-hidden="true" />
      <div>
        <h3 id="urgent-care">Khi nào cần cấp cứu?</h3>
        <p>Đi cấp cứu nếu đau vùng chậu dữ dội hoặc tăng dần, hoặc đau vùng chậu kèm chảy máu âm đạo nhiều, choáng hay ngất.</p>
        <a href="https://www.nhs.uk/symptoms/pelvic-pain/" target="_blank" rel="noreferrer">NHS · Dấu hiệu cấp cứu</a>
      </div>
    </section>
    {topics.map(({ title, icon: Icon, advice, followUp, url, source }) => <details className="health-topic" key={title} open={selected === title || undefined}>
      <summary><Icon size={18} aria-hidden="true" /> {title}</summary>
      <div className="stack health-copy">
        <p>{advice}</p><p>{followUp}</p>
        <a href={url} target="_blank" rel="noreferrer">{source}</a>
      </div>
    </details>)}
    <p className="small muted">Thông tin tham khảo về chăm sóc sức khỏe. Việc chẩn đoán và điều trị cần được trao đổi với nhân viên y tế.</p>
  </div>
}
