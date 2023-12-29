import { SKILLS } from "@/constants/skills"

const Skills = () => {
  return (
    <div>
      {Object.entries(SKILLS).map(([category, skills]) => (
        <div key={category} className="mb-8">
          <h3 className="text-lg font-bold mb-2">{category}</h3>

          <div className="flex flex-wrap gap-2">
            {skills.map((skill) => (
              <span
                key={skill}
                className="inline-block bg-gray-200 rounded-full px-3 py-1 text-sm font-semibold text-gray-700 mr-2 mb-2"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default Skills
