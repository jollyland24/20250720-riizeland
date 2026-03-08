export default function MemberSelector({ members, onMemberClick }) {
  const memberData = [
    { model: 'simplehead', img: '/member0.png' },
    { model: 'sungchan',   img: '/member1.png' },
    { model: 'eunseok',    img: '/member2.png' },
    { model: 'shotaro',    img: '/member3.png' },
    { model: 'sohee',      img: '/member4.png' },
    { model: 'anton',      img: '/member5.png' },
  ];

  return (
    <div className="members">
      {memberData.map(({ model, img }, index) => {
        const member = members[index];
        if (!member.visible) return null;
        return (
          <div
            key={index}
            className={`member${index}`}
            data-model={model}
            style={{
              opacity: member.opacity,
              cursor: member.clickable ? 'pointer' : 'not-allowed',
            }}
            onClick={() => member.clickable && onMemberClick(model)}
          >
            <img src={img} alt={`member${index}`} />
          </div>
        );
      })}
    </div>
  );
}
