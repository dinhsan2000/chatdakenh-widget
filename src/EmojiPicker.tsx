import type { FunctionComponent } from 'preact';

const POPULAR_EMOJIS = [
  "😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "😇", "🙂", 
  "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", 
  "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", 
  "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", 
  "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳",
  "👍", "👎", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "❤️", "💔"
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
}

export const EmojiPicker: FunctionComponent<EmojiPickerProps> = ({ onSelect }) => {
  return (
    <div class="cdk-emoji-picker">
      <div class="cdk-emoji-grid">
        {POPULAR_EMOJIS.map(emoji => (
          <button 
            key={emoji}
            type="button" 
            class="cdk-emoji-btn" 
            onClick={(e) => {
              e.preventDefault();
              onSelect(emoji);
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
};
